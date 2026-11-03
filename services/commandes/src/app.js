'use strict';

const express = require('express');
const { MongoClient } = require('mongodb');
const { randomUUID } = require('node:crypto');

const SERVICE = 'commandes';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = Number(process.env.PORT || 3000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'commandes';

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 2000 });
let db = null;
let ready = false;

async function connectMongo() {
  await client.connect();
  db = client.db(MONGO_DB);
  ready = true;
  await db.collection('orders').createIndex({ userId: 1, createdAt: -1 });
}

function clearTestCollections() {
  if (!db) return Promise.resolve();
  return db.collection('orders').deleteMany({});
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

// Passer une commande: { userId, items: [{ productId, name, price, quantity }] }
app.post('/orders', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'commandes unavailable' });
  try {
    const { userId, items } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items requis (panier vide ?)' });
    }
    for (const it of items) {
      if (!it.productId || !(it.quantity > 0) || typeof it.price !== 'number') {
        return res.status(400).json({ error: `item invalide: ${JSON.stringify(it)}` });
      }
    }
    const total = Number(items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));

    const order = {
      id: randomUUID(),
      userId,
      items,
      total,
      status: 'created',
      createdAt: new Date().toISOString(),
    };
    const doc = { _id: order.id, ...order };
    await db.collection('orders').insertOne(doc);
    res.status(201).json(order);
  } catch (err) { next(err); }
});

// Historique des commandes d'un utilisateur
app.get('/orders/:userId', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'commandes unavailable' });
  try {
    const orders = await db.collection('orders')
      .find({ userId: req.params.userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json(orders);
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(`[${SERVICE}]`, err.message);
  res.status(500).json({ error: 'internal error' });
});

module.exports = { app, connectMongo, clearTestCollections, SERVICE, APP_VERSION, PORT };
