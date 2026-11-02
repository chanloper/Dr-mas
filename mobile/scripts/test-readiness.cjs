const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, mocks = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, Date, Intl, require: name => { if (Object.hasOwn(mocks, name)) return mocks[name]; throw Error(`unexpected import: ${name}`); }, ...globals };
  vm.runInNewContext(source, context); return context.exports;
}
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002', ID = '10000000-0000-4000-8000-000000000001';
const row = { id: ID, patient_id: A, title: '가상 일정', detail: '', time_local: '08:00:00', timezone: 'Asia/Seoul', active: true };
const input = { title: '가상 일정', detail: '', time_local: '08:00' };
function repositoryFixture() {
  const requests = []; let actor = A, result = { data: row, error: null };
  const client = { auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) }, from(table) {
    const request = { table, filters: [] }; requests.push(request);
    const chain = {
      select(value) { request.select = value; return chain; }, order() { return chain; },
      eq(key, value) { request.filters.push([key, value]); return chain; },
      insert(value) { request.operation = 'insert'; request.payload = value; return chain; },
      update(value) { request.operation = 'update'; request.payload = value; return chain; },
      upsert(value, options) { request.operation = 'upsert'; request.payload = value; request.options = options; return chain; },
      single: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    }; return chain;
  } };
  const module = load('src/services/medicationRepository.ts');
  return { ...module, repo: module.createMedicationRepository(client), requests, setActor(value) { actor = value; }, setResult(value) { result = value; } };
}
test('web sessions survive adapter recreation but never touch server memory or other storage keys', async () => {
  const module = load('src/services/secureSessionStorage.web.ts'); const data = new Map([['unrelated', 'keep']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  await module.createBrowserSessionStorage(() => storage).setItem('session', 'fictional-session');
  const next = module.createBrowserSessionStorage(() => storage); assert.equal(await next.getItem('session'), 'fictional-session');
  await next.removeItem('session'); assert.equal(data.get('unrelated'), 'keep');
  const ssr = module.createBrowserSessionStorage(() => null); assert.equal(await ssr.getItem('session'), null);
  await assert.rejects(ssr.setItem('session', 'fictional-session')); assert.equal(await module.secureSessionStorage.getItem('session'), null);
});
test('blocked browser storage yields safe errors without token values', async () => {
  const m = load('src/services/secureSessionStorage.web.ts');
  const storage = m.createBrowserSessionStorage(() => { throw Error('fixture-token-must-not-escape'); });
  for (const task of [() => storage.getItem('session'), () => storage.setItem('session', 'fictional'), () => storage.removeItem('session')]) await assert.rejects(task(), e => e instanceof m.SessionStorageError && !e.message.includes('fixture-token'));
});
test('environment guard rejects mismatched Dev project and preserves default SSR with optional static output', () => {
  const module = load('app.config.ts', {}, { process: { env: { DRMAS_WEB_OUTPUT: 'static', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'dev-ref' } } });
  assert.equal(module.default({ config: { web: { output: 'server' }, extra: {} } }).web.output, 'static');
  const normal = load('app.config.ts', {}, { process: { env: {} } }); assert.equal(normal.default({ config: { web: { output: 'server' } } }).web.output, 'server');
  assert.equal(module.default({ config: {} }).extra.environment.expectedSupabaseRef, 'dev-ref');
  const client = load('src/services/supabase.ts', {
    'react-native-url-polyfill/auto': {}, 'expo-constants': { __esModule: true, default: { expoConfig: { extra: {} } } },
    '@supabase/supabase-js': { createClient: () => { throw Error('must not construct mismatched client'); } }, './secureSessionStorage': {}, './authDiagnostics': { logAuthDiagnostic() {} },
  }, { URL, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://other-ref.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'dev-ref' } } });
  assert.throws(() => client.getSupabaseClient(), e => e instanceof client.SupabaseConfigError);
});
test('private credentials in public Auth configuration fail before manifest serialization', () => {
  for (const env of [{ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture_not_real' }, { EXPO_PUBLIC_SUPABASE_URL: 'https://user:fixture@host.invalid' }, { EXPO_PUBLIC_KAKAO_REST_API_KEY: 'fixture-only' }]) {
    const config = load('app.config.ts', {}, { URL, process: { env } });
    assert.throws(() => config.default({ config: {} }));
  }
});
test('schedule creation uses verified JWT actor and fixed owner; payload cannot grant owner or role', async () => {
  const f = repositoryFixture(); assert.equal((await f.repo.create(A, input)).id, ID);
  assert.equal(f.requests[0].payload.patient_id, A); assert.equal(f.requests[0].payload.timezone, 'Asia/Seoul');
  await assert.rejects(f.repo.create(A, { ...input, patient_id: B })); assert.equal(f.requests.length, 1);
  f.setActor(B); await assert.rejects(f.repo.create(A, input), e => e.code === 'AUTH'); assert.equal(f.requests.length, 1);
});
test('schedule update and archive preserve ownership, timezone and prior records; no delete is issued', async () => {
  const f = repositoryFixture(); await f.repo.update(A, ID, input); await f.repo.archive(A, ID, false);
  assert.ok(f.requests.every(r => r.table === 'medications' && r.operation === 'update'));
  assert.deepEqual(f.requests[0].filters, [['id', ID], ['patient_id', A]]);
  assert.equal('timezone' in f.requests[0].payload, false); assert.equal(f.requests[1].payload.active, false);
});
test('day records upsert checked and unchecked values under the same owner/day, never deleting history', async () => {
  const f = repositoryFixture(); f.setResult({ data: { medication_id: ID, patient_id: A, day: '2026-11-01', taken: false, taken_at: null }, error: null });
  await f.repo.mark(A, ID, '2026-11-01', false);
  assert.equal(f.requests[0].operation, 'upsert'); assert.equal(f.requests[0].payload.taken_at, null);
  assert.equal(f.requests[0].options.onConflict, 'medication_id,day');
  await assert.rejects(f.repo.mark(A, ID, '2026-02-30', true)); assert.equal(f.requests.length, 1);
});
test('server reads reject other-owner rows and server error details are never exposed', async () => {
  const f = repositoryFixture(); f.setResult({ data: [{ ...row, patient_id: B }], error: null });
  await assert.rejects(f.repo.list(A), e => e.code === 'RESPONSE');
  f.setResult({ data: null, error: { message: 'private payload must not escape' } });
  await assert.rejects(f.repo.list(A), e => e.code === 'SERVER' && !e.message.includes('private'));
});
test('cloud layer has no local import, RLS bypass, or automatic retry path; public search remains disabled', () => {
  const repo = fs.readFileSync(path.join(__dirname, '../src/services/medicationRepository.ts'), 'utf8');
  assert.equal(/AsyncStorage|service_role|sb_secret_|\.delete\(/.test(repo), false);
  assert.match(fs.readFileSync(path.join(__dirname, '../../supabase/functions/search-places/.env.example'), 'utf8'), /SEARCH_PUBLIC_ENABLED=false/);
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8')); assert.equal(vercel.buildCommand, 'npm run build:web');
});

function mountCloud(repository) {
  const slots = [], effects = []; let cursor = 0, dirty = true, current, disposed = false, late = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { if (disposed) { late++; return; } const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const module = load('src/features/medications/useCloudMedications.ts', {
    react: hooks, '../../services/supabase': { getSupabaseClient: () => ({}) },
    '../../services/medicationRepository': { ...repositoryFixture(), createMedicationRepository: () => repository },
  });
  function render() { let count = 0; while (dirty && !disposed) { assert.ok(count++ < 30); dirty = false; cursor = 0; current = module.useCloudMedications({ id: A, role: 'patient' }); while (effects.length) effects.shift()(); } }
  render();
  return { get state() { render(); return current; }, get late() { return late; },
    async flush() { for (let i = 0; i < 5; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } render(); },
    dispose() { disposed = true; for (const s of slots) s?.cleanup?.(); },
  };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('cloud day reapply is a no-op and uncertain writes require reread without an automatic duplicate', async () => {
  let creates = 0; const repository = { list: async () => [], records: async () => [], create: async () => { creates++; throw Error('fixture uncertain response'); } };
  const app = mountCloud(repository); await app.flush(); assert.equal(app.state.ready, true);
  app.state.changeDay(app.state.day); assert.equal(app.state.ready, true);
  assert.equal(await app.state.mutate('create', '', input), false); await app.flush();
  assert.equal(app.state.ready, false); await app.state.mutate('create', '', input); assert.equal(creates, 1);
  app.state.refresh(); await app.flush(); assert.equal(app.state.ready, true); assert.equal(creates, 1); app.dispose();
});
test('cloud unmount during a load or mutation prevents previous-user state completion', async () => {
  const read = deferred(); const first = mountCloud({ list: () => read.promise, records: async () => [] });
  await first.flush(); first.dispose(); read.resolve([row]); await first.flush(); assert.equal(first.late, 0);
  const write = deferred(); const second = mountCloud({ list: async () => [row], records: async () => [], update: () => write.promise });
  await second.flush(); const saving = second.state.mutate('update', ID, input); second.dispose(); write.resolve(row);
  assert.equal(await saving, false); assert.equal(second.late, 0);
});
test('cloud load failure never exposes default schedules or enables mutations', async () => {
  let edits = 0; const app = mountCloud({ list: async () => { throw Error('fixture'); }, records: async () => [], create: async () => { edits++; return row; } });
  await app.flush(); assert.equal(app.state.ready, false); assert.equal(app.state.schedules.length, 0);
  await app.state.mutate('create', '', input); assert.equal(edits, 0); assert.ok(app.state.error); app.dispose();
});
