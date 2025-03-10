const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// ใช้ CORS เพื่อให้สามารถเข้าถึง API จากหน้าเว็บ
app.use(cors());

// API สำหรับดึงข้อมูลผู้เล่นจาก players.json
app.get('/check-player', async (req, res) => {
    const serverIp = req.query.server;
    const playerId = req.query.player;

    try {
        // ดึงข้อมูลจาก players.json ของเซิร์ฟเวอร์ที่เลือก
        const response = await axios.get(`http://${serverIp}:30120/players.json`);
        const players = response.data;

        // ค้นหาผู้เล่นจากข้อมูล
        const player = players.find(p => p.id.toString() === playerId);
        if (player) {
            res.json({
                name: player.name,
                steam: player.steam,
                ping: player.ping,
                discord: player.discord,
                status: player.status
            });
        } else {
            res.status(404).json({ message: 'ไม่พบข้อมูลผู้เล่น' });
        }
    } catch (error) {
        console.error("Error fetching players data:", error);
        res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลจากเซิร์ฟเวอร์ได้' });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
