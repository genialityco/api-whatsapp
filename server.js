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

// Sirve el archivo qr.png para poder descargarlo o escanearlo desde el navegador
app.use("/qr.png", express.static(path.join(__dirname, "qr.png")));

// 1) Configuramos el cliente de WhatsApp con LocalAuth
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// 2) Generar QR en consola si hace falta
client.on("qr", (qr) => {
  // 2a) Mostrar un QR ASCII pequeño en consola
  qrcodeTerminal.generate(qr, { small: true });

  // 2b) Mostrar un Data-URL por consola (pégalo en el navegador para ver el QR)
  QRCode.toDataURL(qr, (err, url) => {
    if (err) return console.error("Error generando Data-URL:", err);
    console.log("\nQR Data-URL (pégalo en el navegador):\n", url);
  });

  // 2c) Guardarlo como imagen local para descargar y escanear
  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png:", err);
    else console.log("QR guardado en qr.png (disponible en GET /qr.png)");
  });
});

// 3) Arrancar el cliente
client.initialize();

client.on("ready", () => {
  console.log("✅ Cliente WhatsApp listo");
});

// 4) Ruta para envío de mensajes
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Faltan phone o message" });
  }

  const chatId = `${phone}@c.us`; // formato E.164 + “@c.us”
  try {
    const msg = await client.sendMessage(chatId, message);
    return res.json({ status: "enviado", id: msg.id._serialized });
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Ruta para cerrar sesión
app.post("/logout", async (req, res) => {
  try {
    // 1) Revocamos la sesión en WhatsApp
    await client.logout();

    // 2) Destruimos el cliente (opcional, para limpiar Puppeteer)
    await client.destroy();

    // 3) Borramos la carpeta de LocalAuth
    const authDir = path.resolve(__dirname, "wwebjs_auth");
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    res.json({ status: "sesión completamente cerrada" });
  } catch (err) {
    console.error("Error en logout completo:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5) Levantar el servidor HTTP
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Whatsapp listo en http://localhost:${PORT}`);
});
