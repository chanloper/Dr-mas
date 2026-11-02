// In-process contract/state tests only: no sockets, real DB, or native storage.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const bcrypt = require('../../mobile-api/node_modules/bcrypt');
const { createAuthService } = require('../../mobile-api/src/auth');
const { createHandlers, errorHandler } = require('../../mobile-api/src/app');
const source = relative => ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authSource = source('services/auth.mariadb.ts');

async function fixture() {
  let time = new Date('2026-11-01T00:00:00Z');
  let offline = false;
  let failSave = false;
  let failDelete = false;
  let delayLogin;
  const accounts = new Map();
  const sessions = new Map();
  const secureData = new Map();
  const requests = [];
  const alerts = [];
  const medicationData = new Map();
  const repository = {
    register: async row => {
      if (accounts.has(row.email)) throw Object.assign(new Error(), { code: 'EMAIL_EXISTS' });
      const account = { user_id: accounts.size + 1, email: row.email, username: row.username, password: row.passwordHash, role: row.role };
      accounts.set(row.email, account);
      sessions.set(row.session.tokenHash, { ...row.session, account });
    },
    findByEmail: async email => accounts.get(email),
    createSession: async (id, session) => sessions.set(session.tokenHash, { ...session, account: [...accounts.values()].find(row => row.user_id === id) }),
    findSession: async (hash, now) => {
      const session = sessions.get(hash);
      return session && session.expiresAt > now ? { ...session.account, credential_hash: session.credentialHash } : null;
    },
    deleteSession: async hash => sessions.delete(hash),
  };
  const service = createAuthService({ repository, passwords: bcrypt, dummyHash: await bcrypt.hash('dummy-password', 10), now: () => time, tokenTtlSeconds: 60 });
  const handlers = createHandlers(service);
  const transport = async (url, options) => {
    if (offline) throw Error('offline');
    const route = new URL(url).pathname;
    requests.push({ route, method: options.method, body: options.body && JSON.parse(options.body) });
    if (route === '/auth/login' && delayLogin) await delayLogin;
    const handler = { '/auth/register': handlers.register, '/auth/login': handlers.login, '/auth/me': handlers.me }[route];
    assert.ok(handler, 'unexpected request path');
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    try { await handler({ body: options.body && JSON.parse(options.body), headers: { authorization: options.headers.Authorization } }, res); }
    catch (error) { errorHandler(error, {}, res, () => {}); }
    // JSON roundtrip models the HTTP data boundary, without an HTTP listener.
    const text = JSON.stringify(res.body);
    return { ok: res.statusCode < 400, status: res.statusCode, json: async () => JSON.parse(text) };
  };
  const storage = {
    isAvailableAsync: async () => true,
    getItemAsync: async key => secureData.get(key) ?? null,
    setItemAsync: async (key, value) => { if (failSave) throw Error('locked'); secureData.set(key, value); },
    deleteItemAsync: async key => { if (failDelete) throw Error('locked'); secureData.delete(key); },
  };
  const context = { exports: {}, require: () => storage, process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://auth.invalid' } }, __DEV__: false, URL, AbortController, setTimeout, clearTimeout, fetch: transport };
  vm.runInNewContext(authSource, context);
  const api = context.exports;
  api.watchSession = () => () => {}; // Legacy regression adapter only.

  const { mount } = require('./controller-harness.cjs').createHarness({
    auth: api, alerts,
    storage: {
      getItem: async key => medicationData.get(key) ?? null,
      setItem: async (key, value) => { medicationData.set(key, value); },
    },
  });
  return {
    api, mount, accounts, secureData, requests, alerts, sessions,
    setOffline(value) { offline = value; }, failSave(value) { failSave = value; }, failDelete(value) { failDelete = value; },
    expire() { time = new Date(time.getTime() + 60000); },
    deferLogin() { let resolve; delayLogin = new Promise(done => { resolve = done; }); return () => { resolve(); delayLogin = undefined; }; },
  };
}
const patient = { email: 'person@example.invalid', password: 'password123', name: 'Person', requestedRole: 'patient' };
async function fillLogin(app, password = patient.password) {
  app.state.selectRole('patient'); app.state.setEmail(patient.email); app.state.setPassword(password); await app.flush();
}

test('registration -> /me -> secure storage -> restart -> local logout use one contract', async () => {
  const f = await fixture(); const app = f.mount(); await app.flush();
  app.state.selectRole('patient'); app.state.setRoute('register');
  app.state.setEmail(patient.email); app.state.setName(patient.name); app.state.setPassword(patient.password); app.state.setConfirm(patient.password);
  await app.state.submitAuth(); await app.flush();
  assert.equal(app.state.route, 'dashboard'); assert.equal(app.state.role, 'patient');
  assert.equal(f.secureData.size, 1); assert.equal(app.state.password, '');
  assert.deepEqual(f.requests.map(request => request.route), ['/auth/register', '/auth/me']);
  app.dispose();
  const restarted = f.mount(); await restarted.flush();
  assert.equal(restarted.state.route, 'dashboard');
  await restarted.state.signOut(); await restarted.flush();
  assert.equal(restarted.state.user, null); assert.equal(f.secureData.size, 0); assert.equal(restarted.state.route, 'welcome');
  restarted.dispose();
});
test('server role overrides the selected role and duplicate submissions are blocked', async () => {
  const f = await fixture(); await f.api.register(patient); f.accounts.get(patient.email).role = 'guardian';
  const app = f.mount(); await app.flush(); await fillLogin(app);
  const release = f.deferLogin();
  const first = app.state.submitAuth();
  assert.equal(app.state.authLoading, true);
  await app.state.submitAuth(); release(); await first; await app.flush();
  assert.equal(app.state.role, 'guardian'); assert.equal(app.state.route, 'dashboard');
  assert.equal(f.requests.filter(request => request.route === '/auth/login').length, 1);
  assert.equal('role' in f.requests.find(request => request.route === '/auth/login').body, false);
  app.dispose();
});
test('expiry clears token; offline startup retains token but cannot enter dashboard', async () => {
  const f = await fixture(); const session = await f.api.register(patient); await f.api.saveToken(session.accessToken);
  f.setOffline(true); let app = f.mount(); await app.flush();
  assert.equal(app.state.route, 'login'); assert.equal(app.state.user, null); assert.equal(f.secureData.size, 1);
  assert.ok(app.state.authError); app.dispose();
  f.setOffline(false); f.expire(); app = f.mount(); await app.flush();
  assert.equal(app.state.route, 'login'); assert.equal(f.secureData.size, 0); assert.equal(app.state.user, null); app.dispose();
});
test('expired-token deletion failure keeps the retry action on the visible auth screen', async () => {
  const f = await fixture(); const session = await f.api.register(patient); await f.api.saveToken(session.accessToken); f.expire(); f.failDelete(true);
  const app = f.mount(); await app.flush();
  assert.equal(app.state.route, 'login'); assert.match(app.state.authError, /삭제/);
  f.failDelete(false); await app.state.signOut(); await app.flush();
  assert.equal(f.secureData.size, 0); assert.equal(app.state.route, 'welcome'); app.dispose();
});
test('legacy short password accepted by backend also reaches the controller dashboard', async () => {
  const f = await fixture();
  f.accounts.set(patient.email, { user_id: 99, email: patient.email, username: 'Legacy', password: await bcrypt.hash('old', 10), role: 'patient' });
  const app = f.mount(); await app.flush(); await fillLogin(app, 'old');
  await app.state.submitAuth(); await app.flush();
  assert.equal(app.state.route, 'dashboard'); assert.equal(app.state.user.id, '99'); app.dispose();
});
test('token save failure and invalid credentials never enter dashboard', async () => {
  const f = await fixture(); await f.api.register(patient);
  const app = f.mount(); await app.flush(); await fillLogin(app, 'incorrect');
  await app.state.submitAuth(); await app.flush(); assert.equal(app.state.user, null); assert.ok(app.state.authError);
  f.failSave(true); app.state.setPassword(patient.password);
  await app.state.submitAuth(); await app.flush(); assert.equal(app.state.route, 'login'); assert.equal(app.state.user, null); assert.equal(f.secureData.size, 0); assert.match(app.state.authError, /저장/); app.dispose();
});
test('guardian approval and duplicate email produce actionable mobile errors', async () => {
  const f = await fixture();
  await assert.rejects(f.api.register({ ...patient, requestedRole: 'guardian' }), error => error.code === 'ROLE_APPROVAL_REQUIRED' && /승인/.test(error.message));
  assert.equal(f.accounts.size, 0);
  await f.api.register(patient);
  await assert.rejects(f.api.register(patient), error => error.code === 'EMAIL_EXISTS');
});
test('medication, AI and SOS controller actions still work after authentication', async () => {
  const f = await fixture(); await f.api.register(patient);
  const app = f.mount(); await app.flush(); await fillLogin(app); await app.state.submitAuth(); await app.flush();
  app.state.toggleMedication('1'); await app.flush(); assert.equal(app.state.takenCount, 1);
  app.state.setChatInput('test question'); app.state.sendChat(); await app.flush(); assert.equal(app.state.messages.length, 3);
  app.state.startSOS(); await app.flush();
  for (let i = 0; i < 10; i++) await app.tick();
  assert.equal(app.state.sosLeft, null); assert.equal(app.state.sosNotice, true); app.dispose();
});
test('empty login and short new passwords are still rejected before API requests', async () => {
  const f = await fixture(); const app = f.mount(); await app.flush(); await fillLogin(app, '');
  await app.state.submitAuth();
  assert.equal(f.requests.length, 0); assert.equal(f.alerts.length, 1);
  app.state.setRoute('register'); app.state.setName(patient.name); app.state.setPassword('short'); app.state.setConfirm('short');
  await app.state.submitAuth(); await app.flush();
  assert.equal(f.requests.length, 0); assert.equal(f.alerts.length, 2); assert.equal(app.state.user, null); app.dispose();
});
test('controller keeps dashboard locked when signup requires email confirmation', async () => {
  const f = await fixture(); f.api.register = async () => ({ requiresEmailConfirmation: true });
  const app = f.mount(); await app.flush(); await fillLogin(app); app.state.setRoute('register'); app.state.setName(patient.name); app.state.setConfirm(patient.password);
  await app.state.submitAuth(); await app.flush();
  assert.equal(app.state.route, 'login'); assert.equal(app.state.user, null); assert.equal(f.secureData.size, 0); assert.match(app.state.authNotice, /이메일/); assert.equal(app.state.authError, null); app.dispose();
});
