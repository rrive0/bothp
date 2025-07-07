// check-player API ที่รับ server IP และ player ID
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

const STEAM_API_KEY = '08FDCED3DCE208FE075183C6DDEC360E'; // 👈 คุณต้องไปสร้างเองที่ https://steamcommunity.com/dev/apikey

app.get('/check-player', async (req, res) => {
    const serverIp = req.query.server;
    const playerId = req.query.player;

    try {
        const response = await axios.get(`http://${serverIp}:30120/players.json`);
        const players = response.data;

        const player = players.find(p => p.id.toString() === playerId);
        if (!player) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลผู้เล่น' });
        }

        const identifiers = player.identifiers || [];

        const getIdentifierFuzzy = (key) => {
            const match = identifiers.find(i => i.includes(`${key}:`));
            return match ? match.split(':')[1] : null;
        };

        const steamHex = getIdentifierFuzzy("steam");
        const discordId = getIdentifierFuzzy("discord");
        const license = getIdentifierFuzzy("license");
        const ip = getIdentifierFuzzy("ip");
        const xbox = getIdentifierFuzzy("xbl");
        const live = getIdentifierFuzzy("live");
        const fivem = getIdentifierFuzzy("fivem");

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
            ping: player.ping || "ไม่พบ ping",
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
        console.error("❌ Error fetching players data:", error.message || error);
        res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลจากเซิร์ฟเวอร์ได้' });
    }
});


// ✅ API ใหม่: ดึง avatar + ชื่อ จาก Steam ID
app.get('/steam-avatar', async (req, res) => {
    const steamId = req.query.id;
    if (!steamId || !STEAM_API_KEY) {
        return res.status(400).json({ error: 'SteamID หรือ API KEY ไม่ถูกต้อง' });
    }

    try {
        const steamRes = await axios.get('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', {
            params: {
                key: STEAM_API_KEY,
                steamids: steamId
            }
        });

        const player = steamRes.data.response.players[0];
        if (!player) return res.status(404).json({ error: 'ไม่พบข้อมูล Steam' });

        res.json({
            avatar: player.avatarfull,
            name: player.personaname,
            profile: player.profileurl
        });

    } catch (error) {
        console.error("❌ Steam API Error:", error.message || error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดขณะดึงข้อมูลจาก Steam' });
    }
});

app.listen(port, () => {
    console.log(`✅ Backend server running at http://localhost:${port}`);
});
