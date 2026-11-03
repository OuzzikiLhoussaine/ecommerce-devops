'use strict';

const express = require('express');
const { MongoClient } = require('mongodb');
const { fetchCatalogue } = require('./data.js');

const SERVICE = 'panier';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = Number(process.env.PORT || 3000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'panier';
const CATALOGUE_URL = process.env.CATALOGUE_URL || ''; // ex: http://catalogue:3000

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 2000 });
let db = null;
let ready = false;

async function connectMongo() {
  await client.connect();
  db = client.db(MONGO_DB);
  ready = true;
}

function clearTestCollections() {
  if (!db) return Promise.resolve();
  return db.collection('carts').deleteMany({});
}

async function closeMongo() {
  try { await client.close(); } catch { /* ignore */ }
}

const app = express();
app.use(express.json());

function userIdOf(req) {
  // Identification utilisateur simple par header (demo)
  return req.get('x-user-id') || 'guest';
}

function subtotal(cart) {
  return Number(cart.items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2));
}

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

async function getCart(id) {
  const carts = db.collection('carts');
  const cart = (await carts.findOne({ _id: id })) || { _id: id, items: [] };
  return { userId: id, items: cart.items || [], subtotal: subtotal({ items: cart.items || [] }) };
}

// Consulter le panier de l'utilisateur
app.get('/cart', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'panier unavailable' });
  try {
    res.json(await getCart(userIdOf(req)));
  } catch (err) { next(err); }
});

// Ajouter un article (+/- quantite selon quantity)
app.post('/cart/items', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'panier unavailable' });
  try {
    const { productId, quantity } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId requis' });
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const lookup = await fetchCatalogue(CATALOGUE_URL, productId);
    if (lookup.reason === 'notfound') {
      return res.status(404).json({ error: `produit ${productId} introuvable dans le catalogue` });
    }
    const name = lookup.ok ? lookup.product.name : 'unknown';
    const price = lookup.ok ? lookup.product.price : 0;

    const carts = db.collection('carts');
    const id = userIdOf(req);

    // Ligne deja presente -> quantite += qty
    const updated = await carts.updateOne(
      { _id: id, 'items.productId': productId },
      { $inc: { 'items.$.quantity': qty } },
    );
    if (updated.matchedCount === 0) {
      // Nouvelle ligne
      await carts.updateOne(
        { _id: id },
        { $push: { items: { productId, name, price, quantity: qty } } },
        { upsert: true },
      );
    }
    res.status(201).json(await getCart(id));
  } catch (err) { next(err); }
});

// Retirer une ligne du panier
app.delete('/cart/items/:productId', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'panier unavailable' });
  try {
    const carts = db.collection('carts');
    await carts.updateOne(
      { _id: userIdOf(req) },
      { $pull: { items: { productId: req.params.productId } } },
    );
    res.json(await getCart(userIdOf(req)));
  } catch (err) { next(err); }
});

// Vider entierement le panier (apres commande)
app.delete('/cart', async (req, res, next) => {
  if (!ready) return res.status(503).json({ error: 'panier unavailable' });
  try {
    await db.collection('carts').updateOne(
      { _id: userIdOf(req) },
      { $set: { items: [] } },
    );
    res.json(await getCart(userIdOf(req)));
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(`[${SERVICE}]`, err.message);
  res.status(500).json({ error: 'internal error' });
});

module.exports = { app, connectMongo, closeMongo, clearTestCollections, SERVICE, APP_VERSION, PORT };
