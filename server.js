const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

app.get('/check-player', async (req, res) => {
    const serverIp = req.query.server;
    const playerId = req.query.player;

    // เช็คว่ามีการส่ง server กับ player มาหรือไม่
    if (!serverIp || !playerId) {
        return res.status(400).json({ message: 'กรุณาระบุ server และ player ให้ครบ' });
    }

    try {
        // เรียกข้อมูล players.json จากเซิร์ฟเวอร์ FiveM
        const response = await axios.get(`http://${serverIp}:30120/players.json`, { timeout: 5000 });
        const players = response.data;

        console.log(`Fetched ${players.length} players from ${serverIp}`);

        // หา player ตาม id ที่ส่งมา (string เทียบ string)
        const player = players.find(p => p.id.toString() === playerId);
        if (!player) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลผู้เล่น' });
        }

        const identifiers = player.identifiers || [];

        // ฟังก์ชันค้นหา identifier แบบ fuzzy case-insensitive
        const getIdentifierFuzzy = (key) => {
            const match = identifiers.find(i => i.toLowerCase().includes(`${key.toLowerCase()}:`));
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
                // แปลง steamHex เป็น SteamID64 URL
                steamProfile = `https://steamcommunity.com/profiles/${BigInt("0x" + steamHex)}`;
            } catch {
                steamProfile = "แปลง Steam Hex ไม่สำเร็จ";
            }
        }

        // ส่งข้อมูล JSON กลับ
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

app.listen(port, () => {
    console.log(`✅ Backend server running at http://localhost:${port}`);
});
