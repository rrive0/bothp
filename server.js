const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const https = require('https');

const app = express();

// ============================
// CONFIGURATION (Hardcoded)
// ============================
const PORT = process.env.PORT || 5000;
const CONFIG = {
    cacheDuration: 5000, // 5 วินาที
    timeout: 5000, // 5 วินาที
    maxCacheSize: 100, // จำกัด cache 100 รายการ
    nodeEnv: process.env.NODE_ENV || 'production'
};

// ============================
// SECURITY MIDDLEWARE
// ============================
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
    origin: '*', // เปิดให้ทุก domain เข้าถึง (สำหรับ Netlify)
    methods: ['GET'],
    allowedHeaders: ['Content-Type']
}));

// ============================
// RATE LIMITING
// ============================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 requests ต่อ IP
    message: { 
        success: false,
        message: "Too many requests, please try again later." 
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/check-player', limiter);

// ============================
// LOGGER (Simple)
// ============================
const logger = {
    info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️ ${msg}`),
    error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
    warn: (msg) => console.warn(`[${new Date().toISOString()}] ⚠️ ${msg}`),
    debug: (msg) => {
        if (CONFIG.nodeEnv === 'development') {
            console.debug(`[${new Date().toISOString()}] 🔍 ${msg}`);
        }
    }
};

// ============================
// AXIOS INSTANCE
// ============================
const axiosInstance = axios.create({
    timeout: CONFIG.timeout,
    httpAgent: new http.Agent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10
    }),
    httpsAgent: new https.Agent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10
    })
});

// ============================
// MEMORY CACHE
// ============================
const cache = {};

function getCached(serverIp) {
    const item = cache[serverIp];
    if (!item) return null;
    
    if (Date.now() - item.timestamp > CONFIG.cacheDuration) {
        delete cache[serverIp];
        return null;
    }
    return item.data;
}

function setCache(serverIp, data) {
    const keys = Object.keys(cache);
    if (keys.length >= CONFIG.maxCacheSize) {
        const oldestKey = keys.reduce((a, b) => 
            cache[a].timestamp < cache[b].timestamp ? a : b
        );
        delete cache[oldestKey];
    }
    
    cache[serverIp] = {
        data,
        timestamp: Date.now()
    };
}

function clearExpiredCache() {
    const now = Date.now();
    let count = 0;
    for (const key in cache) {
        if (now - cache[key].timestamp > CONFIG.cacheDuration) {
            delete cache[key];
            count++;
        }
    }
    if (count > 0 && CONFIG.nodeEnv === 'development') {
        logger.debug(`Cleared ${count} expired cache entries`);
    }
}

// Clear cache every minute
setInterval(clearExpiredCache, 60000);

// ============================
// VALIDATION FUNCTIONS
// ============================
function isValidServer(server) {
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/;
    return ipPattern.test(server) || domainPattern.test(server);
}

function isValidPlayerId(id) {
    return id && /^[a-zA-Z0-9\-_]+$/.test(String(id));
}

function isValidPlayerName(name) {
    return name && name.length > 0 && name.length <= 100;
}

// ============================
// FIND PLAYER FUNCTION
// ============================
function findPlayer(players, playerId, playerName) {
    let player = null;
    let searchMethod = 'none';

    // Search by ID
    if (playerId) {
        player = players.find(p => String(p.id) === String(playerId));
        if (player) {
            searchMethod = 'id';
            return { player, searchMethod };
        }
    }

    // Search by name
    if (playerName && !player) {
        const searchKey = playerName.toLowerCase();
        
        // Exact match first
        player = players.find(p => 
            p.name && p.name.toLowerCase() === searchKey
        );
        if (player) {
            searchMethod = 'name_exact';
            return { player, searchMethod };
        }
        
        // Partial match
        player = players.find(p => 
            p.name && p.name.toLowerCase().includes(searchKey)
        );
        searchMethod = 'name_partial';
    }

    return { player, searchMethod };
}

// ============================
// MAIN API ENDPOINT
// ============================
app.get('/check-player', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const serverIp = (req.query.server || "").trim();
        const playerId = (req.query.player || "").trim();
        const playerName = (req.query.name || "").trim().toLowerCase();

        // Validate required fields
        if (!serverIp || (!playerId && !playerName)) {
            return res.status(400).json({ 
                success: false,
                message: "กรุณาระบุ server และ player ID หรือ name" 
            });
        }

        // Validate data
        if (!isValidServer(serverIp)) {
            return res.status(400).json({ 
                success: false,
                message: "Server IP หรือ Domain ไม่ถูกต้อง" 
            });
        }

        if (playerId && !isValidPlayerId(playerId)) {
            return res.status(400).json({ 
                success: false,
                message: "Player ID ไม่ถูกต้อง" 
            });
        }

        if (playerName && !isValidPlayerName(playerName)) {
            return res.status(400).json({ 
                success: false,
                message: "Player Name ไม่ถูกต้อง" 
            });
        }

        logger.info(`Request: server=${serverIp}, id=${playerId || 'none'}, name=${playerName || 'none'}`);

        // ============================
        // GET DATA FROM CACHE OR SERVER
        // ============================
        let players = getCached(serverIp);
        let fromCache = true;

        if (!players) {
            fromCache = false;
            logger.debug(`Fetching players from server: ${serverIp}`);
            
            try {
                const response = await axiosInstance.get(`http://${serverIp}:30120/players.json`, {
                    timeout: CONFIG.timeout
                });
                
                if (response.status !== 200) {
                    return res.status(response.status).json({ 
                        success: false,
                        message: `Server responded with status ${response.status}` 
                    });
                }
                
                players = response.data;
                
                if (!Array.isArray(players) || players.length === 0) {
                    return res.status(404).json({ 
                        success: false,
                        message: "ไม่พบผู้เล่นในเซิร์ฟเวอร์" 
                    });
                }
                
                setCache(serverIp, players);
                logger.debug(`Fetched ${players.length} players from server`);
            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    return res.status(503).json({ 
                        success: false,
                        message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (Connection Refused)" 
                    });
                }
                if (error.code === 'ECONNABORTED') {
                    return res.status(504).json({ 
                        success: false,
                        message: "เซิร์ฟเวอร์ตอบสนองช้าเกินไป (Timeout)" 
                    });
                }
                if (error.code === 'ENOTFOUND') {
                    return res.status(404).json({ 
                        success: false,
                        message: "ไม่พบเซิร์ฟเวอร์ (Host not found)" 
                    });
                }
                throw error;
            }
        }

        // ============================
        // FIND PLAYER
        // ============================
        const { player, searchMethod } = findPlayer(players, playerId, playerName);

        if (!player) {
            return res.status(404).json({ 
                success: false,
                message: 'ไม่พบข้อมูลผู้เล่น' 
            });
        }

        // ============================
        // EXTRACT IDENTIFIERS
        // ============================
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

        // Convert Steam Hex
        let steamProfile = "ไม่พบข้อมูล";
        if (steamHex) {
            try {
                const steamId64 = BigInt("0x" + steamHex);
                steamProfile = `https://steamcommunity.com/profiles/${steamId64}`;
            } catch (error) {
                steamProfile = "แปลง Steam Hex ไม่สำเร็จ";
            }
        }

        // ============================
        // RESPONSE
        // ============================
        const responseTime = Date.now() - startTime;
        
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
                fromCache: fromCache,
                searchMethod: searchMethod,
                totalPlayers: players.length,
                responseTime: responseTime + 'ms',
                timestamp: new Date().toISOString()
            }
        });

        logger.info(`Response: ${responseTime}ms, ${fromCache ? 'cache' : 'fresh'}, method: ${searchMethod}`);

    } catch (error) {
        logger.error(`Error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลจากเซิร์ฟเวอร์",
            timestamp: new Date().toISOString()
        });
    }
});

// ============================
// HEALTH CHECK ENDPOINT
// ============================
app.get('/health', (req, res) => {
    const cacheSize = Object.keys(cache).length;
    const memoryUsage = process.memoryUsage();
    
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        cacheSize: cacheSize,
        cacheDuration: CONFIG.cacheDuration + 'ms',
        maxCacheSize: CONFIG.maxCacheSize,
        memoryUsage: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
        },
        timestamp: new Date().toISOString(),
        environment: CONFIG.nodeEnv
    });
});

// ============================
// ROOT ENDPOINT
// ============================
app.get('/', (req, res) => {
    res.json({
        name: 'FiveM Player Checker API',
        version: '2.0.0',
        description: 'API for checking FiveM players',
        endpoints: {
            checkPlayer: '/check-player?server=IP&player=ID&name=NAME',
            health: '/health'
        },
        status: 'online'
    });
});

// ============================
// 404 HANDLER
// ============================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// ============================
// ERROR HANDLER
// ============================
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ============================
// START SERVER
// ============================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`🚀 FiveM Player Checker API`);
    console.log(`📡 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${CONFIG.nodeEnv}`);
    console.log(`⏱️  Cache duration: ${CONFIG.cacheDuration}ms`);
    console.log(`📊 Max cache size: ${CONFIG.maxCacheSize}`);
    console.log(`========================================`);
});

// ============================
// GRACEFUL SHUTDOWN
// ============================
process.on('SIGTERM', () => {
    logger.info('SIGTERM received - shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received - shutting down gracefully');
    process.exit(0);
});

module.exports = app;