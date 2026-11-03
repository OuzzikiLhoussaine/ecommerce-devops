'use strict';

const express = require('express');
const { MongoClient } = require('mongodb');

const SERVICE = 'catalogue';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = Number(process.env.PORT || 3000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'catalogue';

const SEED_PRODUCTS = [
  { id: 'P-001', name: 'Clavier mecanique', description: 'Clavier AZERTY, switches tactiles, retroeclairage RGB.', price: 49.9, stock: 25 },
  { id: 'P-002', name: 'Souris gaming', description: 'Souris filaire 8000 DPI, 8 boutons programmables.', price: 29.5, stock: 60 },
  { id: 'P-003', name: 'Casque audio', description: 'Casque circum-auriculaire, micro anti-bruit.', price: 79.0, stock: 15 },
  { id: 'P-004', name: 'Ecran 27 pouces', description: 'Ecran IPS QHD 2560x1440, 144 Hz.', price: 219.0, stock: 8 },
  { id: 'P-005', name: 'Station de charge', description: 'Station 4 en 1 USB-C: laptop + 3 appareils.', price: 59.9, stock: 40 },
];

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 2000 });
let db = null;
let ready = false;

async function connectMongo() {
  await client.connect();
  db = client.db(MONGO_DB);
  ready = true;
  const products = db.collection('products');
  if ((await products.estimatedDocumentCount()) === 0) {
    await products.insertMany(SEED_PRODUCTS);
  }
  await products.createIndex({ id: 1 }, { unique: true });
}

function clearTestCollections() {
  if (!db) return Promise.resolve();
  return db.collection('products').deleteMany({});
}

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: APP_VERSION });
});

app.get('/readyz', async (_req, res) => {
  if (!ready) return res.status(503).json({ status: 'unavailable', reason: 'mongo not connected' });
  try {
    await client.db('admin').command({ ping: 1 });
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', reason: err.message });
  }
});

// Liste du catalogue (sans les descriptions, plus legere)
app.get('/products', async (_req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'catalogue unavailable' });
  try {
    const products = await db.collection('products')
      .find({}, { projection: { description: 0 } })
      .sort({ id: 1 })
      .toArray();
    res.json(products);
  } catch (err) { next(err); }
});

// Detail d'un produit
app.get('/products/:id', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'catalogue unavailable' });
  try {
    const product = await db.collection('products').findOne({ id: req.params.id });
    if (!product) return res.status(404).json({ error: `product ${req.params.id} not found` });
    res.json(product);
  } catch (err) { next(err); }
});

// Middleware d'erreurs
app.use((err, _req, res, _next) => {
  console.error(`[${SERVICE}]`, err.message);
  res.status(500).json({ error: 'internal error' });
});

module.exports = { app, connectMongo, clearTestCollections, SERVICE, APP_VERSION, PORT };
