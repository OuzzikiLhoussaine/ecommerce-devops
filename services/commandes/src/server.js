'use strict';

const SERVICE = 'commandes';

/**
 * En cas d'echec de connexion Mongo au boot (StatefulSet pas encore
 * pret), on retente toutes les 2s jusqu'a ce que /readyz reponde OK.
 */
async function boot(connectMongo) {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      await connectMongo();
      break;
    } catch (err) {
      console.error(`[${SERVICE}] boot attempt ${attempts}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.log(`[${SERVICE}] mongo connected`);
}

if (require.main === module) {
  const { app, connectMongo, PORT } = require('./app.js');
  boot(connectMongo).then(() => {
    app.listen(PORT, () => console.log(`[${SERVICE}] listening on :${PORT}`));
  });
}

module.exports = { boot };
