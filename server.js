// server.js
require('dotenv').config();
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
let clientStatus = "inicializando"; // inicializando | esperando_qr | autenticando | listo | desconectado | error
let lastQrDataUrl = null;

// Objeto para guardar el consentimiento por chatId
const notificationConsent = {};

// --- Elige Puppeteer completo o Core según entorno ---
const useFull = process.env.USE_FULL_PUPPETEER === 'true';
const puppeteer = useFull
  ? require("puppeteer")
  : require("puppeteer-core");

// 1) Configuramos el cliente de WhatsApp con LocalAuth
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
    // solo necesario si usamos puppeteer-core:
    executablePath: !useFull
      ? process.env.CHROME_PATH  // en Render suele estar definido como /usr/bin/chrome-stable
      : undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// 2) Evento QR
client.on("qr", (qr) => {
  clientStatus = "esperando_qr";
  qrcodeTerminal.generate(qr, { small: true });

  QRCode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error("Error generando Data-URL:", err);
      lastQrDataUrl = null;
    } else {
      lastQrDataUrl = url;
      console.log("\nQR Data-URL (pégalo en el navegador):\n", url);
    }
  });

  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png:", err);
    else console.log("QR guardado en qr.png (GET /qr.png)");
  });
});

// Evento autenticando
client.on("authenticated", () => {
  clientStatus = "autenticando";
  lastQrDataUrl = null;
  console.log("🔐 Autenticando...");
});

// Evento listo
client.on("ready", () => {
  isReady = true;
  clientStatus = "listo";
  lastQrDataUrl = null;
  console.log("✅ Cliente WhatsApp listo");
});

// Evento desconectado
client.on("disconnected", (reason) => {
  isReady = false;
  clientStatus = "desconectado";
  lastQrDataUrl = null;
  console.log("❌ Cliente desconectado:", reason);
});

// Evento error de autenticación
client.on("auth_failure", (msg) => {
  clientStatus = "error";
  lastQrDataUrl = null;
  console.error("Error de autenticación:", msg);
});

// 4) Inicializar
client.initialize();

// 5) Ruta de envío
app.post("/send", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: "El cliente aún no está listo, inténtalo en unos segundos.",
    });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Faltan phone o message" });
  }

  const chatId = `${phone}@c.us`;

  // Si ya aceptó/rechazó, solo envía el mensaje normal
  if (notificationConsent[chatId] === "accepted") {
    try {
      const msg = await client.sendMessage(chatId, message);
      return res.json({ status: "enviado", id: msg.id._serialized });
    } catch (err) {
      console.error("Error enviando mensaje:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Si no ha aceptado/rechazado, envía el mensaje y luego la pregunta de consentimiento
  try {
    // Envía el mensaje original
    await client.sendMessage(chatId, message);

    // Envía la pregunta de consentimiento
    const consentMsg = "¿Estás de acuerdo en recibir estas notificaciones vía WhatsApp y poder aceptarlas o rechazarlas aquí mismo? Responde [si] o [no].";
    await client.sendMessage(chatId, consentMsg);

    return res.json({ status: "enviado_con_consentimiento" });
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Escucha respuestas del usuario para consentimiento
client.on("message", async (msg) => {
  const chatId = msg.from;
  const body = msg.body.trim().toLowerCase();

  // Solo procesa si no hay consentimiento aún
  if (!notificationConsent[chatId]) {
    if (body === "si" || body === "sí") {
      notificationConsent[chatId] = "accepted";
      await client.sendMessage(chatId, "Has aceptado recibir notificaciones por WhatsApp. ¡Gracias!");
    } else if (body === "no") {
      notificationConsent[chatId] = "rejected";
      await client.sendMessage(chatId, "Has rechazado recibir notificaciones por WhatsApp. No recibirás más mensajes.");
    }
  }
});

// Ruta de estado
app.get("/status", (req, res) => {
  res.json({
    status: clientStatus,
    isReady,
    qr: lastQrDataUrl,
  });
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
