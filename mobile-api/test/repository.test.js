'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRepository } = require('../src/repository');
const registration = { loginId: 'mob_internal', passwordHash: 'hash', username: 'Name', email: 'name@example.invalid', role: 'patient', session: { tokenHash: 'digest', credentialHash: 'credential', expiresAt: new Date() } };

function fixture(failAt, code = 'ER_DUP_ENTRY') {
  const calls = [];
  let count = 0;
  const connection = {
    beginTransaction: async () => { calls.push('begin'); },
    query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      count++;
      if (count === failAt) { const error = new Error('private connector error'); error.code = code; throw error; }
      return { insertId: 41n };
    },
    commit: async () => { calls.push('commit'); },
    rollback: async () => { calls.push('rollback'); },
    release: () => { calls.push('release'); },
  };
  return { calls, repository: createRepository({ getConnection: async () => connection }) };
}
test('registration uses one transaction and parameter binding for all writes', async () => {
  const f = fixture();
  await f.repository.register(registration);
  assert.equal(f.calls[0], 'begin');
  assert.deepEqual(f.calls.slice(-2), ['commit', 'release']);
  const queries = f.calls.filter(call => typeof call === 'object');
  assert.equal(queries.length, 3);
  assert.equal(queries[1].parameters[0], 41n);
  assert.equal(queries[2].parameters[1], 41n);
  assert.equal(queries.every(call => !call.sql.includes(registration.email)), true);
});
test('email conflict rolls back Users insert and does not reach session insert', async () => {
  const f = fixture(2);
  await assert.rejects(f.repository.register(registration), error => error.code === 'EMAIL_EXISTS');
  assert.deepEqual(f.calls.slice(-2), ['rollback', 'release']);
  assert.equal(f.calls.includes('commit'), false);
  assert.equal(f.calls.filter(call => typeof call === 'object').length, 2);
});
test('login-id/session conflicts and unavailable tables are not mislabeled as duplicate email', async () => {
  for (const [stage, code] of [[1, 'ER_DUP_ENTRY'], [3, 'ER_DUP_ENTRY'], [2, 'ER_NO_SUCH_TABLE']]) {
    const f = fixture(stage, code);
    await assert.rejects(f.repository.register(registration), error => error.code === code);
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'release']);
  }
});
test('query layer filters expired sessions and never falls back to login_id', async () => {
  const calls = [];
  const repository = createRepository({ query: async (sql, parameters) => { calls.push({ sql, parameters }); return []; } });
  assert.equal(await repository.findByEmail('unknown@example.invalid'), null);
  assert.equal(await repository.findSession('digest', new Date()), null);
  assert.match(calls[0].sql, /a.email = \?/);
  assert.doesNotMatch(calls[0].sql, /login_id/);
  assert.match(calls[1].sql, /s.expires_at > \?/);
});
test('migration is additive and runtime has no DDL or migration hook', () => {
  const sql = fs.readFileSync('../database/migrations/001_mobile_auth.sql', 'utf8').replace(/--[^\n]*/g, '').replace(/ON (DELETE|UPDATE) RESTRICT/g, '');
  assert.equal((sql.match(/CREATE TABLE/g) || []).length, 2);
  assert.doesNotMatch(sql, /\b(DROP|ALTER|TRUNCATE|UPDATE|DELETE|INSERT|REPLACE|USE)\b/i);
  const runtime = ['server', 'repository', 'app', 'auth'].map(name => fs.readFileSync(`src/${name}.js`, 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /CREATE TABLE|ALTER TABLE|DROP TABLE|initDatabase|schema\.sql/);
});
