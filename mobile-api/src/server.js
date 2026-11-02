'use strict';

// This is the only entry point that can bind a port or construct a real DB pool.
// Importing the app/service/repository for tests never starts it.
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readConfig } = require('./config');
const { createRepository } = require('./repository');
const { createAuthService } = require('./auth');
const { createApp } = require('./app');

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const config = readConfig();
  const passwords = require('bcrypt');
  const dummyHash = await passwords.hash(randomBytes(32).toString('hex'), 10);
  const pool = require('mariadb').createPool(config.database);
  // No schema initialization, migration runner, or legacy server import.
  const service = createAuthService({ repository: createRepository(pool), passwords, dummyHash, tokenTtlSeconds: config.tokenTtlSeconds });
  const server = createApp(service).listen(config.port, config.host);
  server.on('error', async () => { console.error('Mobile authentication listener failed.'); await pool.end(); process.exitCode = 1; });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close(async () => { await pool.end(); });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (require.main === module) main().catch(() => { console.error('Mobile authentication API initialization failed. Check server configuration.'); process.exitCode = 1; });
module.exports = { main };
