#!/usr/bin/env node
import('./dist/api/NezhaApiServer.js').then(() => {
  console.log('[Setup] API server started, keeping process alive');
  // Keep process alive
  setInterval(() => {}, 100000);
});