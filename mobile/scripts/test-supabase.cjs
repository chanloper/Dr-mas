const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => { assert.ok(name in imports, 'unexpected module'); return imports[name]; }, URL, AbortController, setTimeout, clearTimeout, ...globals };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
function secureFixture() {
  const data = new Map(); let failWrite = false; let failDelete = false;
  const native = {
    isAvailableAsync: async () => true,
    getItemAsync: async key => data.get(key) ?? null,
    setItemAsync: async (key, value) => { if (failWrite) throw Error(); assert.ok(Buffer.byteLength(value) < 1500, 'individual keychain item too large'); data.set(key, value); },
    deleteItemAsync: async key => { if (failDelete) throw Error(); data.delete(key); },
  };
  const module = load('secureSessionStorage.ts', { 'expo-secure-store': native });
  return { module, data, failWrite: value => { failWrite = value; }, failDelete: value => { failDelete = value; } };
}
function fixture(env = { EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' }, manifest = {}) {
  let session = null; let profile = { id: 'id-1', display_name: 'User', role: 'patient' }; let signedOut; let appState; let authError = null; let confirm = false; let calls = 0; let refresh = 0; let cleared = false;
  const storage = secureFixture();
  const logs = [];
  const diagnostics = load('authDiagnostics.ts', {}, { __DEV__: true, console: { info: (...args) => logs.push(args) } });
  const client = {
    auth: {
      signUp: async input => { if (authError) return { error: authError }; assert.equal('role' in input.options.data, false); session = confirm ? null : { access_token: 'signed-token' }; return { data: { session }, error: null }; },
      signInWithPassword: async input => { assert.equal('role' in input, false); if (authError) return { error: authError }; session = { access_token: 'signed-token' }; return { data: { session }, error: null }; },
      getUser: async () => ({ data: { user: { id: 'id-1', email: 'user@example.invalid', user_metadata: { role: 'guardian' } } }, error: authError }),
      getSession: async () => ({ data: { session }, error: authError }),
      signOut: async options => { assert.equal(options.scope, 'local'); if (authError) return { error: authError }; session = null; signedOut?.('SIGNED_OUT'); return { error: null }; },
      onAuthStateChange: callback => { signedOut = callback; return { data: { subscription: { unsubscribe() { signedOut = null; } } } }; },
      startAutoRefresh: async () => { refresh++; }, stopAutoRefresh: async () => { refresh--; },
    },
    from: table => { assert.equal(table, 'profiles'); return { select: () => ({ eq: (_field, id) => { assert.equal(id, 'id-1'); return { single: async () => ({ data: profile, error: null }) }; } }) }; },
  };
  const supabase = load('supabase.ts', {
    './authDiagnostics': diagnostics,
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { supabase: manifest } } } },
    'react-native-url-polyfill/auto': {},
    '@supabase/supabase-js': { processLock: () => {}, createClient: (_url, _key, options) => { calls++; assert.equal(options.auth.persistSession, true); assert.equal(options.auth.autoRefreshToken, true); assert.equal(options.auth.detectSessionInUrl, false); assert.ok(options.auth.storage); return client; } },
    './secureSessionStorage': storage.module,
  }, { process: { env } });
  const auth = load('auth.ts', {
    './authDiagnostics': diagnostics,
    './supabase': { ...supabase, clearStoredSupabaseSession: async () => { cleared = true; session = null; } },
    './secureSessionStorage': storage.module,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, callback) => { appState = callback; return { remove() { appState = null; } }; } } },
  });
  return { auth, supabase, client, diagnostics, logs, calls: () => calls, refresh: () => refresh, cleared: () => cleared, setError: error => { authError = error; }, confirmation: () => { confirm = true; }, setProfile: value => { profile = value; }, state: value => appState(value) };
}
const input = { email: 'user@example.invalid', password: 'not-a-real-password', name: 'User', requestedRole: 'patient' };

test('missing configuration and private keys fail before client construction', async () => {
  for (const env of [{}, { EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' }, { EXPO_PUBLIC_SUPABASE_URL: 'http://project.supabase.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }]) {
    const f = fixture(env); await assert.rejects(f.auth.login(input), error => error.code === 'CONFIG'); assert.equal(f.calls(), 0);
  }
});
test('Expo Go manifest supplies a complete validated public pair when runtime env is missing', async () => {
  const f = fixture({}, { url: 'https://project.supabase.invalid', publishableKey: 'sb_publishable_test_only' });
  await f.auth.login(input); assert.equal(f.calls(), 1);
});
test('partial sources are never mixed and manifest private keys remain rejected', async () => {
  const partial = fixture({ EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.invalid' }, { publishableKey: 'sb_publishable_test_only' });
  await assert.rejects(partial.auth.login(input), error => error.code === 'CONFIG'); assert.equal(partial.calls(), 0);
  const secret = fixture({}, { url: 'https://project.supabase.invalid', publishableKey: 'sb_secret_not_allowed' });
  await assert.rejects(secret.auth.login(input), error => error.code === 'CONFIG'); assert.equal(secret.calls(), 0);
});
test('app config preserves existing settings and exports only the two public fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.config.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, URL, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SESSION_SECRET: 'must-not-be-exported', DB_PASS: 'must-not-be-exported' } } };
  vm.runInNewContext(compiled, context);
  const base = { name: 'mobile', slug: 'mobile', scheme: 'mobile', plugins: ['expo-router'], extra: { existing: true } };
  const config = context.exports.default({ config: base });
  assert.equal(config.plugins, base.plugins); assert.equal(config.scheme, base.scheme); assert.equal(config.extra.existing, true);
  assert.deepEqual(Object.keys(config.extra.supabase).sort(), ['publishableKey', 'url']);
  assert.equal(JSON.stringify(config).includes('must-not-be-exported'), false);
});
test('SDK signup, login, stored session and verified server profile determine auth', async () => {
  const f = fixture();
  assert.equal(await f.auth.readToken(), null);
  const result = await f.auth.register(input); assert.equal(result.accessToken, 'signed-token');
  await f.auth.saveToken(result.accessToken);
  const user = await f.auth.getCurrentUser(result.accessToken); assert.equal(user.role, 'patient');
  f.setProfile({ id: 'id-1', display_name: 'Guardian', role: 'guardian' });
  assert.equal((await f.auth.getCurrentUser()).role, 'guardian');
  assert.equal((await f.auth.login(input)).accessToken, 'signed-token');
});
test('email confirmation never yields an authenticated success; guardian signup is blocked', async () => {
  const f = fixture(); f.confirmation();
  const result = await f.auth.register(input); assert.equal(result.requiresEmailConfirmation, true); assert.equal('accessToken' in result, false);
  await assert.rejects(f.auth.register({ ...input, requestedRole: 'guardian' }), error => error.code === 'ROLE_APPROVAL_REQUIRED');
});
test('profile absence or unsupported role blocks dashboard authority', async () => {
  const f = fixture();
  f.setProfile(null); await assert.rejects(f.auth.getCurrentUser(), error => error.code === 'PROFILE');
  f.setProfile({ id: 'id-1', display_name: 'Admin', role: 'admin' }); await assert.rejects(f.auth.getCurrentUser(), error => error.code === 'PROFILE');
});
test('SDK error codes map to safe UI messages without raw errors', async () => {
  const f = fixture();
  for (const [sdk, expected] of [['invalid_credentials', 'UNAUTHORIZED'], ['email_not_confirmed', 'EMAIL_NOT_CONFIRMED'], ['user_already_exists', 'EMAIL_EXISTS']]) {
    f.setError({ code: sdk, message: 'raw-private-error' });
    await assert.rejects(f.auth.login(input), error => error.code === expected && !error.message.includes('raw-private-error'));
  }
});
test('signup diagnostics retain only known codes/status/type and static explanations', async () => {
  const f = fixture();
  f.setError({ name: 'AuthApiError', code: 'email_address_not_authorized', status: 403, message: 'private-email@example.invalid', email: input.email, password: input.password, access_token: 'private-token', url: 'https://private.invalid/path' });
  await assert.rejects(f.auth.register(input), error => error.code === 'EMAIL_DELIVERY');
  const report = f.logs.map(entry => JSON.parse(entry[1])).find(entry => entry.stage === 'signup' && entry.event === 'error');
  assert.equal(report.code, 'email_address_not_authorized'); assert.equal(report.httpStatus, 403); assert.equal(report.type, 'AuthApiError');
  const output = JSON.stringify(f.logs);
  for (const secret of ['private-email@example.invalid', input.email, input.password, 'private-token', 'https://private.invalid/path']) assert.ok(!output.includes(secret));
});
test('unknown error code/name/message cannot inject sensitive values into diagnostics', () => {
  const f = fixture();
  const record = f.diagnostics.safeAuthDiagnostic('signup', 'error', { code: 'private-token', name: 'secret@example.invalid', message: 'private-password', status: 'private-url' });
  assert.equal(record.code, 'UNRECOGNIZED'); assert.equal(record.type, 'UnknownError'); assert.equal(record.httpStatus, null);
  assert.equal(JSON.stringify(record).includes('private'), false);
});
test('HTTP 500 remains a server error even when the SDK marks it retryable', async () => {
  const f = fixture(); f.setError({ name: 'AuthRetryableFetchError', status: 500 });
  await assert.rejects(f.auth.register(input), error => error.code === 'SERVER');
});
test('profile schema failure is distinguishable from a successful Auth signup', async () => {
  const f = fixture(); await f.auth.register(input);
  f.client.from = () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST205', message: 'private-detail' }, status: 404 }) }) }) });
  await assert.rejects(f.auth.getCurrentUser(), error => error.code === 'PROFILE_SCHEMA');
  const logs = f.logs.map(entry => JSON.parse(entry[1]));
  assert.ok(logs.some(entry => entry.stage === 'signup' && entry.event === 'success'));
  assert.ok(logs.some(entry => entry.stage === 'profile' && entry.code === 'PGRST205' && entry.httpStatus === 404));
  assert.ok(!JSON.stringify(logs).includes('private-detail'));
});
test('development-only logging is silent in production', () => {
  const logs = []; const diagnostics = load('authDiagnostics.ts', {}, { __DEV__: false, console: { info: (...args) => logs.push(args) } });
  diagnostics.logAuthDiagnostic('signup', 'error', { code: 'weak_password', status: 422 }); assert.equal(logs.length, 0);
});
test('logout notifies controller, refresh follows AppState and cleanup unsubscribes', async () => {
  const f = fixture(); let notices = 0; const stop = f.auth.watchSession(() => notices++);
  assert.equal(f.refresh(), 1); f.state('background'); assert.equal(f.refresh(), 0); f.state('active');
  await f.auth.login(input); await f.auth.clearToken(); assert.equal(notices, 1); assert.equal(await f.auth.readToken(), null); stop();
});
test('remote logout failure clears local persistence and reports incomplete revocation', async () => {
  const f = fixture(); await f.auth.login(input); f.setError({ name: 'AuthRetryableFetchError' });
  await assert.rejects(f.auth.clearToken(), error => error.code === 'NETWORK'); assert.equal(f.cleared(), true);
});
test('logout also attempts local cleanup when the SDK throws instead of returning an error', async () => {
  const f = fixture(); f.client.auth.signOut = async () => { throw Error('private-error'); };
  await assert.rejects(f.auth.clearToken(), error => error.code === 'NETWORK' && !error.message.includes('private-error')); assert.equal(f.cleared(), true);
});
test('large Unicode sessions roundtrip in bounded encrypted chunks and delete completely', async () => {
  const f = secureFixture(); const storage = f.module.secureSessionStorage;
  const value = JSON.stringify({ access_token: 'fictional', metadata: '가🙂'.repeat(4000) });
  await storage.setItem('session', value); assert.ok(f.data.size > 2); assert.equal(await storage.getItem('session'), value);
  await storage.removeItem('session'); assert.equal(f.data.size, 0);
});
test('failed writes preserve previous committed session and failed deletion is retryable', async () => {
  const f = secureFixture(); const storage = f.module.secureSessionStorage;
  await storage.setItem('session', 'previous'); f.failWrite(true);
  await assert.rejects(storage.setItem('session', 'new')); assert.equal(await storage.getItem('session'), 'previous');
  f.failWrite(false); f.failDelete(true); await assert.rejects(storage.removeItem('session'));
  f.failDelete(false); await storage.removeItem('session'); assert.equal(await storage.getItem('session'), null);
});
test('migration includes RLS and no client role/connection-write grant', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611010001_auth_and_care.sql'), 'utf8');
  for (const table of ['profiles', 'medications', 'medication_records', 'care_links']) assert.ok(sql.includes(`alter table public.${table} enable row level security`));
  assert.ok(sql.includes('grant update (display_name) on public.profiles'));
  assert.doesNotMatch(sql, /grant update\s*\([^)]*\brole\b[^)]*\)/i);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete)[^;]*on public\.care_links[^;]*to authenticated/i);
  assert.ok(sql.includes("c.status = 'approved'")); assert.ok(sql.includes('c.patient_id = auth.uid()'));
  assert.ok(sql.includes('foreign key (medication_id, patient_id)'));
});
