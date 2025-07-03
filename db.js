// db.js
const { MongoClient } = require('mongodb');

const MONGO_URI = "mongodb+srv://contactogeniality:geniality2040@cluster0.esgzt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "whatsapp_messages";
const COLLECTION_NAME = "messages";

let mongoClient;
let collection;

async function connectMongo() {
  mongoClient = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  collection = db.collection(COLLECTION_NAME);
  console.log("✅ Conectado a MongoDB");
}

function getCollection() {
  if (!collection) throw new Error("No conectado a la base de datos");
  return collection;
}

module.exports = {
  connectMongo,
  getCollection,
};
