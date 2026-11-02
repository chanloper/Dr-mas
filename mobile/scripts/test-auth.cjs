const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/services/auth.mariadb.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(base = 'https://auth.invalid', fetcher = async () => { throw Error('offline'); }) {
  const data = new Map();
  const storage = {
    isAvailableAsync: async () => true,
    getItemAsync: async key => data.get(key) ?? null,
    setItemAsync: async (key, value) => { data.set(key, value); },
    deleteItemAsync: async key => { data.delete(key); },
  };
  const context = { exports: {}, require: () => storage, process: { env: { EXPO_PUBLIC_API_BASE_URL: base } }, __DEV__: false, URL, AbortController, setTimeout, clearTimeout, fetch: fetcher };
  vm.runInNewContext(compiled, context);
  return { api: context.exports, storage, data };
}
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const input = { email: 'user@example.invalid', password: 'password123' };
test('unset URL fails without making a network request', async () => {
  const { api } = setup('', () => { assert.fail('network called'); });
  await assert.rejects(api.login(input), e => e.code === 'CONFIG');
});
test('network, duplicate email, credentials and server errors are distinct', async () => {
  await assert.rejects(setup().api.login(input), e => e.code === 'NETWORK');
  for (const [status, code] of [[409, 'EMAIL_EXISTS'], [401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'], [503, 'SERVER']]) {
    await assert.rejects(setup(undefined, async () => response({}, status)).api.login(input), e => e.code === code);
  }
});
test('login request sends credentials only and validates the token', async () => {
  const { api } = setup(undefined, async (url, options) => {
    assert.equal(url, 'https://auth.invalid/auth/login');
    assert.deepEqual(JSON.parse(options.body), input);
    return response({ accessToken: 'server-token' });
  });
  assert.equal((await api.login(input)).accessToken, 'server-token');
  await assert.rejects(setup(undefined, async () => response({})).api.login(input), e => e.code === 'RESPONSE');
});
test('registration sends requestedRole and /me determines the actual role', async () => {
  const { api } = setup(undefined, async (url, options) => {
    if (url.endsWith('/register')) {
      assert.equal(JSON.parse(options.body).requestedRole, 'patient');
      return response({ accessToken: 'token' }, 201);
    }
    assert.equal(options.headers.Authorization, 'Bearer token');
    return response({ id: '1', name: 'User', email: input.email, role: 'guardian' });
  });
  const session = await api.register({ ...input, name: 'User', requestedRole: 'patient' });
  assert.equal((await api.getCurrentUser(session.accessToken)).role, 'guardian');
  await assert.rejects(setup(undefined, async () => response({ id: '1', name: 'User', email: input.email, role: 'admin' })).api.getCurrentUser('token'), e => e.code === 'RESPONSE');
});
test('secure storage roundtrip and unsupported platform fail closed', async () => {
  const { api, storage } = setup();
  assert.equal(await api.readToken(), null);
  await api.saveToken('secret');
  assert.equal(await api.readToken(), 'secret');
  await api.clearToken();
  assert.equal(await api.readToken(), null);
  storage.isAvailableAsync = async () => false;
  await assert.rejects(api.saveToken('secret'), e => e.code === 'STORAGE');
});
test('secure storage native failures surface storage errors', async () => {
  const { api, storage } = setup();
  storage.setItemAsync = storage.getItemAsync = storage.deleteItemAsync = async () => { throw Error('locked'); };
  await assert.rejects(api.readToken(), e => e.code === 'STORAGE');
  await assert.rejects(api.saveToken('secret'), e => e.code === 'STORAGE');
  await assert.rejects(api.clearToken(), e => e.code === 'STORAGE');
});
test('production rejects HTTP and malformed JSON never authenticates', async () => {
  await assert.rejects(setup('http://auth.invalid').api.login(input), e => e.code === 'CONFIG');
  const { api } = setup(undefined, async () => ({ ok: true, json: async () => { throw Error('not json'); } }));
  await assert.rejects(api.login(input), e => e.code === 'RESPONSE');
});
