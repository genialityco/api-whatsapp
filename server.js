require("dotenv").config();
const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const { MessageMedia } = require("whatsapp-web.js");
const mime = require("mime-types");
const axios = require("axios");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { connectMongo, getCollection } = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

function ackToText(ack) {
  switch (ack) {
    case -1: return "Error";
    case 0: return "Pendiente";
    case 1: return "Enviado";
    case 2: return "Entregado";
    case 3: return "Leído";
    default: return "Desconocido";
  }
}

app.use("/qr.png", express.static(path.join(__dirname, "qr.png")));

let isReady = false;
let clientStatus = "inicializando";
let lastQrDataUrl = null;
const notificationConsent = {};

const useFull = process.env.USE_FULL_PUPPETEER === "true";
const puppeteer = useFull ? require("puppeteer") : require("puppeteer-core");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "default" }),
  puppeteer: {
    headless: true,
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

// ACTUALIZA ESTADO DEL MENSAJE EN MONGODB
client.on('message_ack', async (msg, ack) => {
  try {
    if (!msg.id) return;
    const collection = getCollection();
    await collection.updateOne(
      { messageId: msg.id._serialized },
      { $set: { ack, ackText: ackToText(ack), ackDate: new Date() } }
    );
    console.log(`Mensaje ${msg.id._serialized} actualizado a estado ${ackToText(ack)}`);
  } catch (error) {
    console.error('Error actualizando ACK en MongoDB:', error);
  }
});

// GUARDA CADA MENSAJE SALIENTE (AUNQUE FALLE EL ENDPOINT)
client.on('message_create', async (msg) => {
  try {
    if (msg.fromMe) {
      const collection = getCollection();
      // Si ya existe no lo inserta otra vez
      const existe = await collection.findOne({ messageId: msg.id._serialized });
      if (!existe) {
        await collection.insertOne({
          phone: msg.to,
          chatId: msg.to,
          content: msg.body || "",
          messageId: msg.id._serialized,
          ack: msg.ack,
          ackText: ackToText(msg.ack),
          date: new Date(),
        });
        console.log(`(message_create) Guardado mensaje en MongoDB ${msg.id._serialized}`);
      }
    }
  } catch (err) {
    console.error('Error guardando mensaje en message_create:', err);
  }
});

// QR CODE Y EVENTOS DE INICIO
client.on("qr", (qr) => {
  clientStatus = "esperando_qr";
  qrcodeTerminal.generate(qr, { small: true });

  QRCode.toDataURL(qr, (err, url) => {
    lastQrDataUrl = err ? null : url;
    if (!err) console.log("\nQR Data-URL (pégalo en el navegador):\n", url);
  });
  QRCode.toFile("qr.png", qr, { width: 300 }, (err) => {
    if (err) console.error("Error creando qr.png:", err);
    else console.log("QR guardado en qr.png (GET /qr.png)");
  });
});

client.on("authenticated", () => {
  clientStatus = "autenticando";
  lastQrDataUrl = null;
  console.log("🔐 Autenticando...");
});
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

// INICIALIZA WHATSAPP
client.initialize();

// ENDPOINT DE ENVÍO
app.post("/send", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: "El cliente aún no está listo, inténtalo en unos segundos.",
    });
  }

  const { phone, message, imageUrl, imageBase64 } = req.body;
  if (!phone || (!message && !imageUrl && !imageBase64)) {
    return res.status(400).json({ error: "Faltan phone y al menos message o imagen" });
  }

  const chatId = `${phone}@c.us`;

  try {
    let sendResult = null;

    // Imagen (URL o base64)
    if (imageUrl || imageBase64) {
      let media;
      if (imageUrl) {
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
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
      if (imageBase64) {
        let mimeType, base64Data;
        if (imageBase64.startsWith("data:")) {
          const matches = imageBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: "Formato de imagen base64 inválido" });
          }
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          mimeType = "image/jpeg";
          base64Data = imageBase64;
        }
        media = new MessageMedia(mimeType, base64Data, "imagen." + mime.extension(mimeType));
      }
      sendResult = await client.sendMessage(chatId, media, { caption: message || "" });
    }
    // Solo mensaje
    else if (message) {
      sendResult = await client.sendMessage(chatId, message);
    }

    // Solo intenta guardar aquí si sendResult existe
    if (sendResult && sendResult.id && sendResult.id._serialized) {
      const collection = getCollection();
      const messageDoc = {
        phone,
        chatId,
        content: message || "",
        imageUrl: imageUrl || "",
        imageBase64: imageBase64 || "",
        messageId: sendResult.id._serialized,
        ack: sendResult.ack,
        ackText: ackToText(sendResult.ack),
        date: new Date(),
      };
      await collection.insertOne(messageDoc);
      return res.json({ status: "enviado", id: sendResult.id._serialized });
    } else {
      return res.json({
        status: "enviado",
        info: "Mensaje enviado pero no se obtuvo ID serializada.",
      });
    }
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    return res.status(500).json({
      error: err.message || "Error desconocido al enviar el mensaje",
      details: err.data || null,
    });
  }
});

// CONSENTIMIENTO
client.on("message", async (msg) => {
  const chatId = msg.from;
  const body = msg.body.trim().toLowerCase();
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

// STATUS Y LOGOUT
app.get("/status", (req, res) => {
  res.json({
    status: clientStatus,
    isReady,
    qr: lastQrDataUrl,
  });
});


// VER ESTADO DE MENSAJES
app.get("/sent-messages", async (req, res) => {
  try {
    const collection = getCollection();
    // Puedes filtrar por query: ?phone=57300...
    const query = {};
    if (req.query.phone) {
      query.phone = req.query.phone;
    }
    const mensajes = await collection
      .find(query)
      .sort({ date: -1 })
      .limit(100)
      .toArray();
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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

// LEVANTA SERVIDOR
const PORT = process.env.PORT || 3000;
connectMongo().catch(console.error);
app.listen(PORT, () => {
  console.log(`🚀 Backend Whatsapp listo en http://localhost:${PORT}`);
});
