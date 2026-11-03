'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.MONGO_URL = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017';
process.env.MONGO_DB = 'commandes_test';

const { app, connectMongo, clearTestCollections, closeMongo } = require('../src/app.js');

let server;
let base;

before(async () => {
  await connectMongo();
  await clearTestCollections();
  server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeMongo();
});

const USER = `test-user-${Math.random().toString(36).slice(2)}`;

test('GET /healthz -> ok', async () => {
  const res = await fetch(`${base}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.service, 'commandes');
});

test('POST /orders -> cree une commande avec le total calcule', async () => {
  const res = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: USER,
      items: [
        { productId: 'P-001', name: 'Clavier mecanique', price: 49.9, quantity: 1 },
        { productId: 'P-002', name: 'Souris gaming', price: 29.5, quantity: 2 },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
  assert.equal(body.userId, USER);
  assert.equal(body.total, 108.9);
  assert.equal(body.status, 'created');
});

test('POST /orders -> 400 sans items', async () => {
  const res = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: USER }),
  });
  assert.equal(res.status, 400);
});

test('GET /orders/:userId -> historique de l\'utilisateur', async () => {
  const res = await fetch(`${base}/orders/${USER}`);
  assert.equal(res.status, 200);
  const orders = await res.json();
  assert.ok(Array.isArray(orders) && orders.length >= 1);
  assert.ok(orders[0].total > 0);
  assert.equal(orders.some((o) => o.userId !== USER), false);
});
