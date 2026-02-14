const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

/* ==========================
   AXIOS OPTIMIZED INSTANCE
========================== */
const axiosInstance = axios.create({
    timeout: 5000, // ป้องกันค้าง
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

/* ==========================
   SIMPLE MEMORY CACHE (5 วิ)
========================== */
const cache = {};
const CACHE_DURATION = 5000; // 5 วินาที

function getCached(serverIp) {
    const item = cache[serverIp];
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_DURATION) {
        delete cache[serverIp];
        return null;
    }
    return item.data;
}

function setCache(serverIp, data) {
    cache[serverIp] = {
        data,
        timestamp: Date.now()
    };
}

/* ==========================
   SAFE SERVER VALIDATION
========================== */
function isValidServer(server) {
    return /^[a-zA-Z0-9\.\-]+$/.test(server);
}

/* ==========================
   CHECK PLAYER API
========================== */
app.get('/check-player', async (req, res) => {

    const serverIp = (req.query.server || "").trim();
    const playerId = (req.query.player || "").trim();
    const playerName = (req.query.name || "").trim().toLowerCase();

    if (!serverIp || (!playerId && !playerName)) {
        return res.status(400).json({ message: "กรุณาระบุ server และ player ID หรือ name" });
    }

    if (!isValidServer(serverIp)) {
        return res.status(400).json({ message: "Server IP ไม่ถูกต้อง" });
    }

    try {

        /* ==========================
           USE CACHE IF EXISTS
        ========================== */
        let players = getCached(serverIp);

        if (!players) {
            const response = await axiosInstance.get(`http://${serverIp}:30120/players.json`);
            players = response.data;
            setCache(serverIp, players);
        }

        if (!Array.isArray(players)) {
            return res.status(500).json({ message: "ข้อมูล players.json ไม่ถูกต้อง" });
        }

        /* ==========================
           FIND PLAYER (เร็วขึ้น)
        ========================== */
        let player = null;

        if (playerId) {
            player = players.find(p => String(p.id) === String(playerId));
        }

        if (!player && playerName) {
            player = players.find(p =>
                p.name && p.name.toLowerCase().includes(playerName)
            );
        }

        if (!player) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลผู้เล่น' });
        }

        const identifiers = player.identifiers || [];

        const getIdentifier = (prefix) => {
            const found = identifiers.find(id => id.startsWith(prefix + ":"));
            return found ? found.split(":")[1] : null;
        };

        const steamHex = getIdentifier("steam");
        const discordId = getIdentifier("discord");
        const license = getIdentifier("license");
        const ip = getIdentifier("ip");
        const xbox = getIdentifier("xbl");
        const live = getIdentifier("live");
        const fivem = getIdentifier("fivem");

        let steamProfile = "ไม่พบข้อมูล";

        if (steamHex) {
            try {
                steamProfile = `https://steamcommunity.com/profiles/${BigInt("0x" + steamHex)}`;
            } catch {
                steamProfile = "แปลง Steam Hex ไม่สำเร็จ";
            }
        }

        res.json({
            name: player.name || "ไม่พบชื่อ",
            ping: player.ping ?? "ไม่พบ ping",
            id: player.id,
            steamHex: steamHex || "ไม่พบข้อมูล",
            steamProfile: steamHex ? steamProfile : "ไม่พบข้อมูล",
            discord: discordId || "ไม่พบข้อมูล",
            license: license || "ไม่พบข้อมูล",
            ip: ip || "ไม่พบข้อมูล",
            xbox: xbox || "ไม่พบข้อมูล",
            live: live || "ไม่พบข้อมูล",
            fivem: fivem || "ไม่พบข้อมูล",
            allIdentifiers: identifiers
        });

    } catch (error) {

        console.error("❌ Error:", error.message);

        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ message: "Server ตอบสนองช้าเกินไป" });
        }

        return res.status(500).json({
            message: "ไม่สามารถดึงข้อมูลจากเซิร์ฟเวอร์ได้"
        });
    }
});

/* ==========================
   START SERVER
========================== */
app.listen(port, () => {
    console.log(`✅ Backend server running at http://localhost:${port}`);
});

