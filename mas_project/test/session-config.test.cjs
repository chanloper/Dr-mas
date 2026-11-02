'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readSessionSecret } = require('../config/session');
const serverPath = path.resolve(__dirname, '../server.js');
const source = fs.readFileSync(serverPath, 'utf8');

test('missing, short, non-string and whitespace secrets fail without revealing values', () => {
    for (const candidate of [undefined, null, '', 'x'.repeat(31), ' '.repeat(64), ` ${'x'.repeat(40)}`, `${'x'.repeat(40)}\n`, `${'x'.repeat(20)}\t${'y'.repeat(20)}`, 123, []]) {
        let caught;
        try { readSessionSecret({ SESSION_SECRET: candidate }); } catch (error) { caught = error; }
        assert.ok(caught instanceof Error);
        assert.ok(caught.message.includes('SESSION_SECRET'));
        assert.ok(caught.message.includes('32'));
        if (typeof candidate === 'string' && candidate.length >= 20) assert.ok(!caught.message.includes(candidate));
    }
});

test('32-character boundary and randomly generated 32-byte secret are accepted unchanged', () => {
    const boundary = randomBytes(16).toString('hex');
    const recommended = randomBytes(32).toString('hex');
    assert.ok(readSessionSecret({ SESSION_SECRET: boundary }) === boundary);
    assert.ok(readSessionSecret({ SESSION_SECRET: recommended }) === recommended);
});

function evaluateServer(env) {
    const calls = [];
    let sessionOptions;
    const stopped = new Error('test boundary: no DB initialization');
    const app = { use() {}, set() {} };
    const express = () => { calls.push('express'); return app; };
    express.json = express.urlencoded = express.static = () => () => {};
    const multer = () => ({});
    multer.memoryStorage = () => ({});
    const sandbox = {
        process: { env }, __dirname: path.dirname(serverPath),
        require(name) {
            calls.push(`require:${name}`);
            if (name === 'dotenv') return { config() {} }; // Never load the real .env.
            if (name === './config/session') return { readSessionSecret: () => readSessionSecret(env) };
            if (name === 'express') return express;
            if (name === 'express-session') return options => { sessionOptions = options; return () => {}; };
            if (name === 'mariadb') return { createPool() { calls.push('DB_BOUNDARY'); throw stopped; } };
            if (name === 'cors') return () => () => {};
            if (name === 'multer') return multer;
            if (name === 'path') return path;
            if (['bcrypt', 'axios', '@google/generative-ai'].includes(name)) return {};
            throw new Error('unexpected test dependency');
        },
    };
    let caught;
    try { vm.runInNewContext(source, sandbox, { filename: 'server-under-test.js' }); } catch (error) { caught = error; }
    return { calls, sessionOptions, caught, stopped };
}

test('server rejects invalid configuration before constructing Express or a database pool', () => {
    for (const env of [{}, { SESSION_SECRET: 'x'.repeat(31) }]) {
        const result = evaluateServer(env);
        assert.ok(result.caught?.message.includes('SESSION_SECRET'));
        assert.ok(!result.calls.includes('require:express'));
        assert.ok(!result.calls.includes('DB_BOUNDARY'));
        assert.ok(result.sessionOptions === undefined);
    }
});

test('valid configuration supplies only the environment secret and preserves session behavior', () => {
    const value = randomBytes(32).toString('hex');
    const result = evaluateServer({ SESSION_SECRET: value });
    assert.ok(result.caught === result.stopped, `Unexpected test boundary (${result.caught?.name}); calls: ${result.calls.join(', ')}`);
    assert.ok(result.sessionOptions.secret === value);
    assert.equal(result.sessionOptions.resave, false);
    assert.equal(result.sessionOptions.saveUninitialized, true);
    assert.equal(result.sessionOptions.cookie.maxAge, 3600000);
});

test('server changes are limited to secret loading, validation and the session secret option', () => {
    // Historical content stays in memory only; it must never appear in a diff/error.
    const original = execFileSync('git', ['show', 'HEAD:mas_project/server.js'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const normalize = text => text.replace(/\r\n/g, '\n')
        .replace(/^const \{ readSessionSecret \} = require\('\.\/config\/session'\);\n/m, '')
        .replace(/^const sessionSecret = readSessionSecret\(\);[^\n]*\n/m, '')
        .replace(/^\s*secret:[^\n]*$/m, '    secret: <REDACTED>');
    assert.ok(normalize(source) === normalize(original), 'Unexpected web server changes; values omitted');
});

test('example configuration contains no assigned credentials and requires private configuration', () => {
    const example = fs.readFileSync(path.resolve(__dirname, '../env.example'), 'utf8');
    const assignments = example.split(/\r?\n/).filter(line => /^\s*[A-Z_]+\s*=/.test(line));
    assert.ok(assignments.every(line => line.slice(line.indexOf('=') + 1).trim() === ''));
    assert.ok(/^SESSION_SECRET=\s*$/m.test(example));
    const legacyExample = fs.readFileSync(path.resolve(__dirname, '../../src/backend/.env.exapmle'), 'utf8');
    assert.ok(/^DB_PASS=\s*$/m.test(legacyExample));
});
