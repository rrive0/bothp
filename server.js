const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

/* ==============================
   AXIOS OPTIMIZED
============================== */
const axiosInstance = axios.create({
    timeout: 5000,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

/* ==============================
   CACHE SYSTEM (10 วิ)
============================== */
const cache = {};
const CACHE_DURATION = 10000;

function getCached(key) {
    const item = cache[key];
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_DURATION) {
        delete cache[key];
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    cache[key] = { data, timestamp: Date.now() };
}

/* ==============================
   SERVER VALIDATION
============================== */
function isValidServer(server) {
    if (!/^[a-zA-Z0-9\.\-]+$/.test(server)) return false;
    if (server.startsWith("127.") || server.startsWith("192.168") || server.startsWith("10.")) return false;
    return true;
}

/* ==============================
   STEAM PROFILE FETCH
============================== */
async function getSteamProfile(steamHex) {
    try {
        const steamId64 = BigInt("0x" + steamHex).toString();
        const apiKey = process.env.STEAM_API_KEY;
        if (!apiKey) return null;

        const response = await axiosInstance.get(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/`,
            { params: { key: apiKey, steamids: steamId64 } }
        );

        const player = response.data.response.players[0];
        if (!player) return null;

        return {
            steamId64,
            personaName: player.personaname,
            profileUrl: player.profileurl,
            avatar: player.avatarfull,
            status: player.personastate
        };
    } catch {
        return null;
    }
}

/* ==============================
   MAIN API
============================== */
app.get('/check-player', async (req, res) => {

    const serverIp = (req.query.server || "").trim();
    const playerId = (req.query.player || "").trim();
    const playerName = (req.query.name || "").trim().toLowerCase();
    const steamHexSearch = (req.query.steam || "").trim();
    const discordSearch = (req.query.discord || "").trim();

    if (!serverIp) {
        return res.status(400).json({ message: "กรุณาระบุ server" });
    }

    if (!isValidServer(serverIp)) {
        return res.status(400).json({ message: "Server ไม่ถูกต้อง" });
    }

    try {

        /* ==============================
           FETCH PLAYERS + DYNAMIC
        =============================== */

        let players = getCached(serverIp + "_players");
        let dynamic = getCached(serverIp + "_dynamic");

        if (!players) {
            const response = await axiosInstance.get(`http://${serverIp}:30120/players.json`);
            players = response.data;
            setCache(serverIp + "_players", players);
        }

        if (!dynamic) {
            try {
                const response = await axiosInstance.get(`http://${serverIp}:30120/dynamic.json`);
                dynamic = response.data;
                setCache(serverIp + "_dynamic", dynamic);
            } catch {
                dynamic = null;
            }
        }

        if (!Array.isArray(players)) {
            return res.status(500).json({ message: "players.json ไม่ถูกต้อง" });
        }

        /* ==============================
           FIND PLAYER
        =============================== */

        let player = null;

        if (playerId) {
            player = players.find(p => String(p.id) === String(playerId));
        }

        if (!player && playerName) {
            player = players.find(p => p.name && p.name.toLowerCase().includes(playerName));
        }

        if (!player && steamHexSearch) {
            player = players.find(p =>
                p.identifiers && p.identifiers.some(id => id.includes(steamHexSearch))
            );
        }

        if (!player && discordSearch) {
            player = players.find(p =>
                p.identifiers && p.identifiers.some(id => id.includes(discordSearch))
            );
        }

        if (!player) {
            return res.status(404).json({ message: "ไม่พบผู้เล่น" });
        }

        const identifiers = player.identifiers || [];

        const getIdentifier = (prefix) => {
            const found = identifiers.find(id => id.startsWith(prefix + ":"));
            return found ? found.split(":")[1] : null;
        };

        const steamHex = getIdentifier("steam");
        const discordId = getIdentifier("discord");

        let steamProfileData = null;

        if (steamHex) {
            steamProfileData = await getSteamProfile(steamHex);
        }

        res.json({
            server: serverIp,
            serverInfo: dynamic ? {
                hostname: dynamic.hostname,
                maxClients: dynamic.sv_maxclients,
                playersOnline: players.length
            } : null,
            player: {
                id: player.id,
                name: player.name,
                ping: player.ping,
                identifiers
            },
            steam: steamProfileData,
            discord: discordId || null
        });

    } catch (error) {

        if (error.code === "ECONNABORTED") {
            return res.status(504).json({ message: "Server ตอบช้าเกินไป" });
        }

        return res.status(500).json({ message: "ไม่สามารถดึงข้อมูลได้" });
    }
});

/* ==============================
   START SERVER
============================== */
app.listen(port, () => {
    console.log(`🔥 Server running on port ${port}`);
});
