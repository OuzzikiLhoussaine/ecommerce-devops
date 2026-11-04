'use strict';

const express = require('express');
const path = require('node:path');

const SERVICE = 'gateway';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = Number(process.env.PORT || 3000);

// URLs internes du cluster (DNS Kubernetes des Services)
const UPSTREAMS = {
  catalogue: process.env.CATALOGUE_URL || 'http://localhost:30081',
  panier: process.env.PANIER_URL || 'http://localhost:30082',
  commandes: process.env.COMMANDES_URL || 'http://localhost:30083',
};

const app = express();
app.use(express.json());

/**
 * Petit reverse-proxy HTTP/JSON.
 * - route les /api/<service>/* vers le microservice correspondant
 * - propage la methode, le body JSON et le header x-user-id
 */
function proxy(name, baseUrl) {
  return async function handle(req, res) {
    const url = `${baseUrl}${req.path}`;
    const headers = {};
    if (req.get('x-user-id')) headers['x-user-id'] = req.get('x-user-id');
    const options = { method: req.method, headers };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(req.body || {});
    }

    try {
      const upstream = await fetch(url, options);
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const payload = await upstream.arrayBuffer();
      res.status(upstream.status);
      res.set('content-type', contentType);
      res.send(Buffer.from(payload));
    } catch (err) {
      // Microservice indisponible -> la requete echoue proprement
      res.status(502).json({ error: `service ${name} indisponible`, detail: err.message });
    }
  };
}

app.use('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: APP_VERSION });
});

// Hook de capture d'ecran (utilise par la doc de soutenance uniquement) :
// repond au bout de `ms` millisecondes (max 8000) — permet au navigateur
// headless de garder l'evenement "load" en attente pendant que le JS
// de la boutique affiche les donnees recues des microservices.
app.get('/__snapwait', async (req, res) => {
  const ms = Math.min(Number.parseInt(req.query.ms, 10) || 0, 8000);
  await new Promise((r) => setTimeout(r, ms));
  res.status(204).end();
});

// Verifie la disponibilite des 3 microservices en amont (info).
// NB: la reponse reste 200 meme si un amont est en panne — sinon la
// sonde readiness retirerait le pod des endpoints et le NodePort
// deviendrait injoignable, ce qui genererait une 2eme alerte Nagios
// (redondante) lors de la panne d'un seul microservice.
app.get('/readyz', async (_req, res) => {
  const keys = Object.keys(UPSTREAMS);
  const dependencies = await Promise.all(keys.map(async (name) => {
    try {
      const r = await fetch(`${UPSTREAMS[name]}/healthz`, { signal: AbortSignal.timeout(1500) });
      return { service: name, ok: r.ok };
    } catch {
      return { service: name, ok: false };
    }
  }));
  const ok = dependencies.every((r) => r.ok);
  res.json({ status: ok ? 'ready' : 'degraded', dependencies });
});

app.use('/api/catalogue', proxy('catalogue', UPSTREAMS.catalogue));
app.use('/api/panier', proxy('panier', UPSTREAMS.panier));
app.use('/api/commandes', proxy('commandes', UPSTREAMS.commandes));

// Frontend de demo (page statique)
app.use(express.static(path.join(__dirname, 'public')));

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

module.exports = { app, UPSTREAMS, SERVICE, APP_VERSION, PORT };
