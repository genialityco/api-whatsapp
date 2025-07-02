// server.js
require("dotenv").config();
const express = require("express");
const { Client, LocalAuth, NoAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const { MessageMedia } = require("whatsapp-web.js");
const mime = require("mime-types");
const axios = require("axios");
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
const useFull = process.env.USE_FULL_PUPPETEER === "true";
const puppeteer = useFull ? require("puppeteer") : require("puppeteer-core");

// 1) Configuramos el cliente de WhatsApp con LocalAuth
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
    // solo necesario si usamos puppeteer-core:
    executablePath: !useFull
      ? process.env.CHROME_PATH
        ? process.env.CHROME_PATH
        : "/usr/bin/google-chrome-stable"
      : undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

const chromePath = "/usr/bin/google-chrome-stable";

if (fs.existsSync(chromePath)) {
  console.log("✅ Chrome está instalado en:", chromePath);
} else {
  console.error("❌ Chrome no se encontró en:", chromePath);
}

const chromePath2 = "/usr/bin/google-chrome";

if (fs.existsSync(chromePath2)) {
  console.log("✅ Chrome está instalado en:", chromePath2);
} else {
  console.error("❌ Chrome no se encontró en:", chromePath2);
}

console.error(
  "🔥 donde esta chrome':",
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable"
);

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
  try {
    isReady = true;
    clientStatus = "listo";
    lastQrDataUrl = null;
    console.log("✅ Cliente WhatsApp listo");
  } catch (err) {
    console.error("🔥 Error en 'ready':", err);
  }
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

client.on("disconnected", (reason) => {
  console.warn("⚠️ Cliente desconectado:", reason);
});

client.on("error", (error) => {
  console.error("🛑 Error general:", error);
});

process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Rejection:", reason);
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

  const { phone, message, imageUrl, imageBase64 } = req.body;

  // Validar que al menos uno esté presente
  if (!phone || (!message && !imageUrl && !imageBase64)) {
    return res
      .status(400)
      .json({ error: "Faltan phone y al menos message o imagen" });
  }

  const chatId = `${phone}@c.us`;

  try {
    let sendResult = null;

    // 1) Si viene imagen (URL o base64)
    if (imageUrl || imageBase64) {
      let media;

      // Imagen desde URL
      if (imageUrl) {
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        const contentType =
          response.headers["content-type"] ||
          mime.lookup(imageUrl) ||
          "image/jpeg";
        media = new MessageMedia(
          contentType,
          Buffer.from(response.data, "binary").toString("base64"),
          "imagen." + mime.extension(contentType)
        );
      }

      // Imagen en base64
      if (imageBase64) {
        // Soporta formato dataURL o solo base64
        let mimeType, base64Data;
        if (imageBase64.startsWith("data:")) {
          const matches = imageBase64.match(
            /^data:([A-Za-z-+/]+);base64,(.+)$/
          );
          if (!matches || matches.length !== 3) {
            return res
              .status(400)
              .json({ error: "Formato de imagen base64 inválido" });
          }
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          // Asumimos jpg por defecto si no es dataURL
          mimeType = "image/jpeg";
          base64Data = imageBase64;
        }
        media = new MessageMedia(
          mimeType,
          base64Data,
          "imagen." + mime.extension(mimeType)
        );
      }

      // Envía imagen + mensaje como caption (opcional)
      sendResult = await client.sendMessage(chatId, media, {
        caption: message || "",
      });
    }
    // 2) Si solo es mensaje
    else if (message) {
      sendResult = await client.sendMessage(chatId, message);
    }

    // Revisa si sendResult existe y tiene ID serializada
    if (sendResult && sendResult.id && sendResult.id._serialized) {
      return res.json({ status: "enviado", id: sendResult.id._serialized });
    } else {
      // Respuesta genérica de éxito si no hay id, pero tampoco error
      return res.json({
        status: "enviado",
        info: "Mensaje enviado pero no se obtuvo ID serializada.",
      });
    }
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    // Devuelve el mensaje de error real y, si existe, un detalle de respuesta de WhatsApp
    return res.status(500).json({
      error: err.message || "Error desconocido al enviar el mensaje",
      details: err.data || null,
    });
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
      await client.sendMessage(
        chatId,
        "Has aceptado recibir notificaciones por WhatsApp. ¡Gracias!"
      );
    } else if (body === "no") {
      notificationConsent[chatId] = "rejected";
      await client.sendMessage(
        chatId,
        "Has rechazado recibir notificaciones por WhatsApp. No recibirás más mensajes."
      );
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
