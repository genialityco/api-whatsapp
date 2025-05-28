// server.js
const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json());

// Permitir CORS para cualquier origin
app.use(cors());

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
  // 2a) Mostrar un Data-URL por consola (pégalo en el navegador para ver el QR)
  QRCode.toDataURL(qr, (err, url) => {
    if (err) return console.error(err);
    console.log("QR Data-URL (pégalo en el navegador):\n", url);
  });

  // 2b) Opcional: guardarlo como imagen local para descargar y escanear
  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png", err);
    else console.log("QR guardado en qr.png");
  });
});
// 3) Arrancar el cliente
client.initialize();

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
