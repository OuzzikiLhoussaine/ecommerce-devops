'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.CATALOGUE_URL = 'http://127.0.0.1:1';   // services volontairement
process.env.PANIER_URL = 'http://127.0.0.1:1';     // indisponibles pour tester
process.env.COMMANDES_URL = 'http://127.0.0.1:1';  // la gateway seule

const { app, UPSTREAMS } = require('../src/app.js');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) server.close();
});

test('GET /healthz -> ok', async () => {
  const res = await fetch(`${base}/healthz`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.service, 'gateway');
});

test('GET /readyz -> 503 quand un microservice amont est en panne', async () => {
  const res = await fetch(`${base}/readyz`);
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.ok(body.dependencies.some((d) => d.ok === false));
});

test('GET /api/catalogue/products -> 502 si le catalogue est en panne', async () => {
  const res = await fetch(`${base}/api/catalogue/products`);
  assert.equal(res.status, 502);
});
