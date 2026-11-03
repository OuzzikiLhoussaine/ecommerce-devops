'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.MONGO_URL = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017';
process.env.MONGO_DB = 'catalogue_test';

const { app, connectMongo, closeMongo } = require('../src/app.js');

let server;
let base;

before(async () => {
  // connectMongo charge les produits de demo si la collection est vide
  await connectMongo();
  server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeMongo();
});

test('GET /healthz -> ok', async () => {
  const res = await fetch(`${base}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'catalogue');
});

test('GET /products -> liste de produits seede', async () => {
  const res = await fetch(`${base}/products`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body) && body.length >= 5, 'au moins 5 produits');
  assert.ok(body[0].id && body[0].name && typeof body[0].price === 'number');
  assert.equal(body[0].description, undefined, 'liste sans description');
});

test('GET /products/:id -> detail complet', async () => {
  const res = await fetch(`${base}/products/P-001`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 'P-001');
  assert.ok(body.description);
});

test('GET /products/:id -> 404 si produit inconnu', async () => {
  const res = await fetch(`${base}/products/P-999`);
  assert.equal(res.status, 404);
});
