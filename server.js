// server.js
const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Sirve el QR como imagen estática para descarga/escaneo
app.use("/qr.png", express.static(path.join(__dirname, "qr.png")));

let isReady = false;

// 1) Configuramos el cliente de WhatsApp con LocalAuth
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
    executablePath: "/usr/bin/google-chrome-stable", // ← Ruta a Chrome estable
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// 2) Evento QR
client.on("qr", (qr) => {
  // ASCII pequeño en consola
  qrcodeTerminal.generate(qr, { small: true });

  // Data-URL para pegar en el navegador
  QRCode.toDataURL(qr, (err, url) => {
    if (err) return console.error("Error generando Data-URL:", err);
    console.log("\nQR Data-URL (pégalo en el navegador):\n", url);
  });

  // Guardar como imagen
  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png:", err);
    else console.log("QR guardado en qr.png (GET /qr.png)");
  });
});

// 3) Cuando esté listo
client.on("ready", () => {
  isReady = true;
  console.log("✅ Cliente WhatsApp listo");
});

// 4) Inicializar
client.initialize();

// 5) Ruta de envío
app.post("/send", async (req, res) => {
  if (!isReady) {
    return res
      .status(503)
      .json({
        error: "El cliente aún no está listo, inténtalo en unos segundos.",
      });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Faltan phone o message" });
  }

  const chatId = `${phone}@c.us`;
  try {
    const msg = await client.sendMessage(chatId, message);
    return res.json({ status: "enviado", id: msg.id._serialized });
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 6) Ruta de logout
app.post("/logout", async (req, res) => {
  try {
    await client.logout();
    await client.destroy();

    const authDir = path.resolve(__dirname, "wwebjs_auth");
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    isReady = false;
    res.json({ status: "sesión completamente cerrada" });
  } catch (err) {
    console.error("Error en logout completo:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7) Levantar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Whatsapp listo en http://localhost:${PORT}`);
});
