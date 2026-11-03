'use strict';

const { app, PORT } = require('./app.js');

app.listen(PORT, () => {
  console.log(`[gateway] listening on :${PORT}`);
});
