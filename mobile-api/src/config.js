'use strict';

function integer(value, fallback, min, max, name) {
  const text = value === undefined || value === '' ? String(fallback) : String(value);
  const parsed = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  return parsed;
}

function readConfig(env = process.env) {
  for (const key of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Missing configuration: ${key}`);
  }
  return {
    database: {
      host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME,
      port: integer(env.DB_PORT, 3306, 1, 65535, 'DB_PORT'), connectionLimit: 5,
      timezone: 'Z', connectTimeout: 5000, acquireTimeout: 10000,
      multipleStatements: false,
    },
    host: env.MOBILE_API_HOST || '127.0.0.1',
    port: integer(env.MOBILE_API_PORT, 3001, 1, 65535, 'MOBILE_API_PORT'),
    tokenTtlSeconds: integer(env.AUTH_TOKEN_TTL_SECONDS, 3600, 60, 86400, 'AUTH_TOKEN_TTL_SECONDS'),
  };
}
module.exports = { readConfig };
