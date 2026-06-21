const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

// ============================
// AXIOS OPTIMIZED INSTANCE
// ============================
const axiosInstance = axios.create({
    timeout: 5000,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

// ============================
// SIMPLE MEMORY CACHE (5 วิ)
// ============================
const cache = {};
const CACHE_DURATION = 5000;

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

// ============================
// SAFE SERVER VALIDATION
// ============================
function isValidServer(server) {
    return /^[a-zA-Z0-9\.\-]+$/.test(server);
}

// ============================
// CHECK PLAYER API
// ============================
app.get('/check-player', async (req, res) => {
    const serverIp = (req.query.server || "").trim();
    const playerId = (req.query.player || "").trim();
    const playerName = (req.query.name || "").trim().toLowerCase();

    // ตรวจสอบค่าที่ส่งมา
    console.log(`🔍 Request: server=${serverIp}, id=${playerId}, name=${playerName}`);

    if (!serverIp || (!playerId && !playerName)) {
        return res.status(400).json({ 
            success: false,
            message: "กรุณาระบุ server และ player ID หรือ name" 
        });
    }

    if (!isValidServer(serverIp)) {
        return res.status(400).json({ 
            success: false,
            message: "Server IP ไม่ถูกต้อง" 
        });
    }

    try {
        // ดึงข้อมูลจาก Cache หรือ Server
        let players = getCached(serverIp);

        if (!players) {
            console.log(`📡 Fetching from: http://${serverIp}:30120/players.json`);
            
            const response = await axiosInstance.get(`http://${serverIp}:30120/players.json`);
            players = response.data;
            
            console.log(`✅ Got ${Array.isArray(players) ? players.length : 'invalid'} players`);
            
            // บันทึก Cache เฉพาะเมื่อเป็น Array
            if (Array.isArray(players)) {
                setCache(serverIp, players);
            }
        }

        // ตรวจสอบว่าเป็น Array หรือไม่
        if (!Array.isArray(players)) {
            console.log(`❌ players is not array:`, typeof players);
            return res.status(500).json({ 
                success: false,
                message: "ข้อมูล players.json ไม่ถูกต้อง" 
            });
        }

        if (players.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "ไม่พบผู้เล่นในเซิร์ฟเวอร์นี้" 
            });
        }

        // ค้นหาผู้เล่น
        let player = null;
        let searchMethod = 'none';

        if (playerId) {
            player = players.find(p => String(p.id) === String(playerId));
            if (player) searchMethod = 'id';
            console.log(`🔍 Search by ID: ${playerId} -> ${player ? 'found' : 'not found'}`);
        }

        if (!player && playerName) {
            player = players.find(p =>
                p.name && p.name.toLowerCase().includes(playerName)
            );
            if (player) searchMethod = 'name';
            console.log(`🔍 Search by Name: ${playerName} -> ${player ? 'found' : 'not found'}`);
        }

        if (!player) {
            return res.status(404).json({ 
                success: false,
                message: 'ไม่พบข้อมูลผู้เล่น' 
            });
        }

        // ดึงข้อมูล identifiers
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

        // ส่ง Response
        res.json({
            success: true,
            data: {
                name: player.name || "ไม่พบชื่อ",
                ping: player.ping ?? "ไม่พบ ping",
                id: player.id,
                steamHex: steamHex || "ไม่พบข้อมูล",
                steamProfile: steamProfile,
                discord: discordId || "ไม่พบข้อมูล",
                license: license || "ไม่พบข้อมูล",
                ip: ip || "ไม่พบข้อมูล",
                xbox: xbox || "ไม่พบข้อมูล",
                live: live || "ไม่พบข้อมูล",
                fivem: fivem || "ไม่พบข้อมูล",
                allIdentifiers: identifiers
            },
            meta: {
                searchMethod: searchMethod,
                totalPlayers: players.length,
                timestamp: new Date().toISOString()
            }
        });

        console.log(`✅ Response: ${player.name} (ID: ${player.id})`);

    } catch (error) {
        console.error("❌ Error:", error.message);
        console.error("📝 Full error:", error);

        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ 
                success: false,
                message: "Server ตอบสนองช้าเกินไป" 
            });
        }

        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({ 
                success: false,
                message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (ปิดหรือไม่พร้อม)" 
            });
        }

        if (error.response) {
            return res.status(error.response.status).json({ 
                success: false,
                message: `Server ตอบกลับด้วย status ${error.response.status}` 
            });
        }

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถดึงข้อมูลจากเซิร์ฟเวอร์ได้",
            error: error.message
        });
    }
});

// ============================
// HEALTH CHECK
// ============================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        cacheSize: Object.keys(cache).length,
        timestamp: new Date().toISOString()
    });
});

// ============================
// ROOT ENDPOINT
// ============================
app.get('/', (req, res) => {
    res.json({
        name: 'FiveM Player Checker API',
        version: '1.0.0',
        endpoints: {
            checkPlayer: '/check-player?server=IP&player=ID&name=NAME',
            health: '/health'
        }
    });
});

// ============================
// START SERVER
// ============================
app.listen(port, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`✅ Backend server running`);
    console.log(`📡 Port: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`========================================`);
});
