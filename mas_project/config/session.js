'use strict';

// Pure configuration validation: never reads files, opens a DB or starts a server.
function readSessionSecret(env = process.env) {
    const secret = env.SESSION_SECRET;
    if (typeof secret !== 'string' || [...secret].length < 32 || secret.trim() !== secret || /\s/u.test(secret)) {
        // The error must identify the setting, never include its supplied value.
        throw new Error('SESSION_SECRET is required and must contain at least 32 non-whitespace characters. Use a cryptographically random secret; no default is provided.');
    }
    return secret;
}

module.exports = { readSessionSecret };
