'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createAuthService } = require('../src/auth');
const digest = value => createHash('sha256').update(value).digest('hex');
const fixedTime = new Date('2026-11-01T00:00:00Z');
const input = { email: 'Person@Example.invalid ', password: 'valid-password', name: '사용자', requestedRole: 'patient' };

function fixture() {
  const accounts = new Map();
  const sessions = new Map();
  let writes = 0;
  let compareCalls = 0;
  const passwords = {
    hash: async (value, cost) => { assert.equal(cost, 10); return `hash:${value}`; },
    compare: async (value, hash) => { compareCalls++; return hash === `hash:${value}`; },
  };
  const repository = {
    async register(row) {
      if (accounts.has(row.email)) { const error = new Error(); error.code = 'EMAIL_EXISTS'; throw error; }
      writes++;
      const user = { user_id: 7, username: row.username, email: row.email, role: row.role, password: row.passwordHash, login_id: row.loginId };
      accounts.set(row.email, user);
      sessions.set(row.session.tokenHash, { ...row.session, user, credential_hash: row.session.credentialHash });
    },
    async findByEmail(email) { return accounts.get(email); },
    async createSession(id, session) {
      const user = [...accounts.values()].find(row => row.user_id === id);
      sessions.set(session.tokenHash, { ...session, user, credential_hash: session.credentialHash });
    },
    async findSession(hash, now) { const session = sessions.get(hash); return session && session.expiresAt > now ? { ...session.user, credential_hash: session.credential_hash } : null; },
    async deleteSession(hash) { sessions.delete(hash); },
  };
  let time = fixedTime;
  const service = createAuthService({ repository, passwords, now: () => time, dummyHash: 'dummy', tokenTtlSeconds: 60 });
  return { service, accounts, sessions, repository, passwords, advance: () => { time = new Date(fixedTime.getTime() + 60000); }, writes: () => writes, compares: () => compareCalls };
}

test('register normalizes email, assigns server role, and returns no password or DB token hash', async () => {
  const f = fixture();
  const result = await f.service.register({ ...input, role: 'guardian', user_id: 999 });
  assert.deepEqual(Object.keys(result), ['accessToken']);
  assert.match(result.accessToken, /^[A-Za-z0-9_-]{43}$/);
  const account = f.accounts.get('person@example.invalid');
  assert.equal(account.role, 'patient');
  assert.match(account.login_id, /^mob_[a-f0-9]{32}$/);
  assert.equal(f.sessions.has(digest(result.accessToken)), true);
  const user = await f.service.me(`Bearer ${result.accessToken}`);
  assert.deepEqual(user, { id: '7', email: 'person@example.invalid', name: '사용자', role: 'patient' });
});
test('guardian selection cannot grant a role or create a user', async () => {
  const f = fixture();
  await assert.rejects(f.service.register({ ...input, requestedRole: 'guardian' }), error => error.status === 403 && error.code === 'ROLE_APPROVAL_REQUIRED');
  assert.equal(f.writes(), 0);
});
test('duplicate normalized email returns 409', async () => {
  const f = fixture();
  await f.service.register(input);
  await assert.rejects(f.service.register({ ...input, email: 'PERSON@example.invalid' }), error => error.status === 409);
});
test('legacy hashes are verified and role is reloaded, not accepted from request', async () => {
  const f = fixture();
  f.accounts.set('person@example.invalid', { user_id: 19, email: 'person@example.invalid', username: 'Family', role: 'guardian', password: 'hash:old' });
  const result = await f.service.login({ email: input.email, password: 'old', role: 'patient' });
  const me = await f.service.me(`Bearer ${result.accessToken}`);
  assert.equal(me.role, 'guardian');
  assert.equal(me.id, '19');
  f.accounts.get('person@example.invalid').role = 'patient';
  assert.equal((await f.service.me(`Bearer ${result.accessToken}`)).role, 'patient');
});
test('bad credentials and absent account both return 401 and use password comparison', async () => {
  const f = fixture();
  await f.service.register(input);
  for (const body of [{ ...input, password: 'incorrect' }, { ...input, email: 'missing@example.invalid' }]) {
    await assert.rejects(f.service.login(body), error => error.status === 401 && error.code === 'INVALID_CREDENTIALS');
  }
  assert.equal(f.compares(), 2);
});
test('expiry, malformed token, logout and web password change invalidate sessions', async () => {
  const f = fixture();
  const first = await f.service.register(input);
  await f.service.logout(`Bearer ${first.accessToken}`);
  await assert.rejects(f.service.me(`Bearer ${first.accessToken}`), error => error.status === 401);
  const second = await f.service.login(input);
  f.accounts.get('person@example.invalid').password = 'hash:changed';
  await assert.rejects(f.service.me(`Bearer ${second.accessToken}`), error => error.status === 401);
  f.accounts.get('person@example.invalid').password = 'hash:valid-password';
  const third = await f.service.login(input);
  f.advance();
  await assert.rejects(f.service.me(`Bearer ${third.accessToken}`), error => error.status === 401);
  for (const header of [undefined, 'Basic token', 'Bearer short', `Bearer ${'a'.repeat(44)}`]) {
    await assert.rejects(f.service.me(header), error => error.status === 401);
  }
});
test('validation handles Unicode byte limits and schema-compatible names before writes', async () => {
  const f = fixture();
  for (const patch of [{ password: 'short' }, { password: '가'.repeat(25) }, { password: 'password\0value' }, { name: 'x'.repeat(31) }, { requestedRole: 'admin' }, { email: 'a..b@example.invalid' }, { email: 'a@-invalid.example' }]) {
    await assert.rejects(f.service.register({ ...input, ...patch }), error => error.status === 422);
  }
  assert.equal(f.writes(), 0);
});
test('database failures never produce a session response', async () => {
  const f = fixture();
  f.repository.register = async () => { throw Error('database unavailable'); };
  await assert.rejects(f.service.register(input));
  f.repository.findByEmail = async () => { throw Error('database unavailable'); };
  await assert.rejects(f.service.login(input));
});
test('real bcrypt cost-10 legacy credentials work without rewriting the stored hash', async () => {
  const bcrypt = require('bcrypt');
  const existingHash = await bcrypt.hash('legacy-password', 10);
  let storedSession;
  const row = { user_id: 88, email: 'legacy@example.invalid', username: 'Legacy', role: 'patient', password: existingHash };
  const repository = {
    findByEmail: async () => row,
    createSession: async (id, session) => { assert.equal(id, 88); storedSession = session; },
    findSession: async () => ({ ...row, credential_hash: storedSession.credentialHash }),
  };
  const service = createAuthService({ repository, passwords: bcrypt, dummyHash: existingHash });
  const result = await service.login({ email: row.email, password: 'legacy-password' });
  assert.equal((await service.me(`Bearer ${result.accessToken}`)).id, '88');
  assert.equal(row.password, existingHash);
  await assert.rejects(service.login({ email: row.email, password: 'wrong-password' }), error => error.status === 401);
});
