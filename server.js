const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 5000;

app.use(cors());

app.get('/check-player', async (req, res) => {
  const serverIp = req.query.server;
  const playerId = req.query.player;

  if (!serverIp || !playerId) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  try {
    const response = await axios.get(`http://${serverIp}/players.json`, { timeout: 5000 });
    const players = response.data;

    const player = players.find(p => p.id.toString() === playerId);
    if (!player) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้เล่น" });
    }

    const identifiers = player.identifiers || [];
    const getId = (key) => {
      const match = identifiers.find(i => i.includes(`${key}:`));
      return match ? match.split(':')[1] : "ไม่พบข้อมูล";
    };

    const steamHex = getId("steam");
    const discordId = getId("discord");
    const license = getId("license");
    const ip = getId("ip");
    const xbox = getId("xbl");
    const live = getId("live");
    const fivem = getId("fivem");

    let steamProfile = "ไม่พบข้อมูล";
    if (steamHex !== "ไม่พบข้อมูล") {
      try {
        steamProfile = `https://steamcommunity.com/profiles/${BigInt("0x" + steamHex)}`;
      } catch {
        steamProfile = "แปลง Steam Hex ไม่สำเร็จ";
      }
    }

    res.json({
      name: player.name || "ไม่พบชื่อ",
      ping: player.ping || "ไม่พบ ping",
      steamHex,
      steamProfile,
      discord: discordId,
      license,
      ip,
      xbox,
      live,
      fivem
    });

  } catch (error) {
    console.error("❌ Error:", error.message || error);
    res.status(500).json({ message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ปลายทางได้" });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server ready at http://localhost:${port}`);
});
