'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.MONGO_URL = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017';
process.env.MONGO_DB = 'panier_test';
// Aucun catalogue de disponible pendant les tests -> fallback "unreachable"
process.env.CATALOGUE_URL = '';

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

const USER = { headers: Object.fromEntries([['x-user-id', `test-user-${Math.random().toString(36).slice(2)}`]]) };

test('GET /healthz -> ok', async () => {
  const res = await fetch(`${base}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.service, 'panier');
});

test('GET /cart -> panier vide au debut', async () => {
  const res = await fetch(`${base}/cart`, USER);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.items, []);
  assert.equal(body.subtotal, 0);
});

test('POST /cart/items -> ajoute un article', async () => {
  const res = await fetch(`${base}/cart/items`, {
    method: 'POST',
    headers: { ...USER.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'P-001' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].productId, 'P-001');
  assert.equal(body.items[0].quantity, 1);
  assert.equal(body.subtotal, 0);
});

test('POST /cart/items x2 -> cumule la quantite', async () => {
  const res = await fetch(`${base}/cart/items`, {
    method: 'POST',
    headers: { ...USER.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'P-001', quantity: 2 }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].quantity, 3);
});

test('POST /cart/items -> 400 sans productId', async () => {
  const res = await fetch(`${base}/cart/items`, {
    method: 'POST',
    headers: { ...USER.headers, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('DELETE /cart/items/:pid -> retire la ligne', async () => {
  const res = await fetch(`${base}/cart/items/P-001`, {
    method: 'DELETE',
    headers: USER.headers,
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.items, []);
});
