// server.js
require("dotenv").config();
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

app.use("/qr.png", express.static(path.join(__dirname, "qr.png")));

let isReady = false;
let clientStatus = "inicializando";
let lastQrDataUrl = null;

const notificationConsent = {};

const useFull = process.env.USE_FULL_PUPPETEER === "true";

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
    executablePath: !useFull ? process.env.CHROME_PATH : undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  },
});

client.on("qr", (qr) => {
  clientStatus = "esperando_qr";
  qrcodeTerminal.generate(qr, { small: true });

  QRCode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error("Error generando Data-URL:", err);
      lastQrDataUrl = null;
    } else {
      lastQrDataUrl = url;
      console.log("\nQR Data-URL:", url);
    }
  });

  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png:", err);
  });
});

client.on("authenticated", () => {
  clientStatus = "autenticando";
  lastQrDataUrl = null;
  console.log("🔐 Autenticando...");
});

client.on("ready", () => {
  isReady = true;
  clientStatus = "listo";
  lastQrDataUrl = null;
  console.log("✅ Cliente WhatsApp listo");
});

client.on("disconnected", (reason) => {
  isReady = false;
  clientStatus = "desconectado";
  lastQrDataUrl = null;
  console.log("❌ Cliente desconectado:", reason);
});

client.on("auth_failure", (msg) => {
  clientStatus = "error";
  lastQrDataUrl = null;
  console.error("Error de autenticación:", msg);
});

client.initialize();

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

  try {
    await client.sendMessage(chatId, message);

    if (!notificationConsent[chatId]) {
      const consentMsg =
        "¿Aceptas recibir notificaciones por WhatsApp? Responde [si] o [no].";
      await client.sendMessage(chatId, consentMsg);
      return res.json({ status: "enviado_con_consentimiento" });
    }

    res.json({ status: "enviado" });
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    res.status(500).json({ error: err.message });
  }
});

client.on("message", async (msg) => {
  const chatId = msg.from;
  const body = msg.body.trim().toLowerCase();

  if (!notificationConsent[chatId]) {
    if (body === "si" || body === "sí") {
      notificationConsent[chatId] = "accepted";
      await client.sendMessage(
        chatId,
        "Has aceptado recibir notificaciones por WhatsApp."
      );
    } else if (body === "no") {
      notificationConsent[chatId] = "rejected";
      await client.sendMessage(
        chatId,
        "Has rechazado recibir notificaciones por WhatsApp."
      );
    }
  }
});

app.get("/status", (req, res) => {
  res.json({ status: clientStatus, isReady, qr: lastQrDataUrl });
});

app.post("/logout", async (req, res) => {
  try {
    await client.logout();
    await client.destroy();
    fs.rmSync(path.resolve(__dirname, "wwebjs_auth"), {
      recursive: true,
      force: true,
    });
    isReady = false;
    res.json({ status: "sesión cerrada correctamente" });
  } catch (err) {
    console.error("Error en logout:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend WhatsApp listo en http://localhost:${PORT}`);
});
