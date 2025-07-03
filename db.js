// db.js
const { MongoClient } = require('mongodb');

const MONGO_URI = "mongodb+srv://contactogeniality:geniality2040@cluster0.esgzt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "whatsapp_messages";

let mongoClient;
let db; // <--- cambio aquí

async function connectMongo() {
  mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME); // <--- así guardas la db
  console.log("✅ Conectado a MongoDB");
}

function getCollection(name = "messages") {
  if (!db) throw new Error("No conectado a la base de datos");
  return db.collection(name);
}

module.exports = {
  connectMongo,
  getCollection,
};
