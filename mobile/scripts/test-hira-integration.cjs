// Synthetic public records and injected fetch only. No real credentials/API calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file); if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports, URL, Response, Headers, AbortController, TextEncoder, TextDecoder, Uint8Array, setTimeout, clearTimeout,
      fetch: () => { throw Error('live fetch forbidden'); }, require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === 'react/jsx-runtime') return require(name);
        if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(absolute), `${name}.ts`)));
        throw Error(`unexpected dependency ${name}`);
      } }, { filename: absolute }); return exports;
  }
  return load;
}
const client = loader()('services/hiraClient.ts');

test('disease card shows Korean name first, discloses exact code and English only on request, and selection only fills input', () => {
  let expanded = false; const chosen = [];
  const { DiseaseReferenceCard } = loader({ react: { useState: () => [expanded, fn => { expanded = fn(expanded); }] },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable' }, './ui': { Action: 'Action', C: {}, s: {} }
  })('components/DiseaseReferenceCard.tsx');
  const item = { name: '급성 비인두염(감기)', code: 'J00', englishName: 'Acute nasopharyngitis' };
  const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
  const render = () => nodes(DiseaseReferenceCard({ item, onChooseName: name => chosen.push(name) }));
  let all = render(); assert.equal(chosen.length, 0);
  assert.ok(all.some(n => n.props?.children === item.name));
  assert.equal(JSON.stringify(all).includes(item.englishName), false);
  const details = all.find(n => n.type === 'Pressable');
  assert.equal(details.props.accessibilityState.expanded, false); assert.equal(details.props.style.minHeight, 48);
  details.props.onPress(); all = render();
  assert.equal(all.find(n => n.type === 'Pressable').props.accessibilityState.expanded, true);
  assert.ok(JSON.stringify(all).includes('J00')); assert.ok(JSON.stringify(all).includes(item.englishName));
  all.find(n => n.props?.label === '이 질병에 대해 알아보기').props.onPress();
  assert.deepEqual(chosen, [item.name]);
  all.find(n => n.type === 'Pressable').props.onPress(); assert.equal(JSON.stringify(render()).includes(item.englishName), false);
});
const query = { kind: 'disease', by: 'code', query: 'J00', rows: 1 };
const source = { publisher: '건강보험심사평가원', datasetUrl: 'https://www.data.go.kr/data/15119055/openapi.do', fetchedAt: '2026-11-08T00:00:00Z', clinicalEvidence: false };
const page = { items: [{ code: 'J00', name: '합성 질병명', englishName: null }], page: 1, rows: 1, total: 1, hasMore: false, truncated: false, source };
const options = { url: 'http://172.30.1.53:8787', development: true, token: async () => 'synthetic-jwt' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('HIRA reference request uses existing session but a separate endpoint and never carries provider credentials or clinical evidence', async () => {
  let calls = 0;
  const result = await client.requestHira(query, { ...options, transport: async (url, init) => {
    calls++; assert.equal(new URL(url).pathname, '/api/hira/reference'); assert.equal(new URL(url).search, '');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-jwt'); assert.deepEqual(JSON.parse(init.body), query); assert.equal(init.redirect, 'error'); return json(page);
  } });
  assert.equal(calls, 1); assert.equal(result.source.clinicalEvidence, false); assert.equal(result.items[0].code, 'J00');
  await assert.rejects(client.requestHira(query, { ...options, token: async () => null, transport: async () => { throw Error('must not call'); } }), e => e.code === 'LOGIN');
});

test('reference response rejects swapped coordinates and clinical provenance; duplicate IDs are removed without name-only merging', () => {
  for (const data of [{ ...page, source: { ...source, clinicalEvidence: true } }, { ...page, source: { ...source, datasetUrl: 'https://untrusted.invalid' } }, { ...page, hasMore: true }]) assert.throws(() => client.validateHiraPage(data, query));
  const row = { id: 'fixture-1', name: '같은 이름 합성병원', address: null, phone: null, institutionType: null, coordinates: null, distanceMeters: null };
  const hospitalPage = { ...page, rows: 3, total: 3, items: [row, row, { ...row, id: 'fixture-2' }], source: { ...source, datasetUrl: 'https://www.data.go.kr/data/15001698/openapi.do' } };
  const result = client.validateHiraPage(hospitalPage, { kind: 'hospital', name: '합성병원', rows: 3 });
  assert.equal(result.items.length, 2); assert.equal(result.items[1].id, 'fixture-2');
  assert.throws(() => client.validateHiraPage({ ...hospitalPage, items: [{ ...row, coordinates: { latitude: 127, longitude: 37 } }] }, { kind: 'hospital', name: '합성병원', rows: 3 }));
  assert.throws(() => client.validateHiraPage({ ...hospitalPage, items: [{ ...row, distanceMeters: 100 }] }, { kind: 'hospital', name: '合成', rows: 3 }));
});

test('reference failures distinguish login/config/quota/server from empty data; timeout and cancellation settle without retries', async () => {
  for (const [status, body, expected] of [[401, {}, 'LOGIN'], [429, {}, 'LIMITED'], [504, {}, 'TIMEOUT'], [503, { error: 'HIRA_KEY_NOT_REGISTERED' }, 'CONFIG'], [503, { error: 'HIRA_HTTP' }, 'SERVER']]) {
    let calls = 0; await assert.rejects(client.requestHira(query, { ...options, transport: async () => { calls++; return json(body, status); } }), e => e.code === expected); assert.equal(calls, 1);
  }
  const empty = await client.requestHira(query, { ...options, transport: async () => json({ ...page, total: 0, items: [] }) }); assert.equal(empty.items.length, 0);
  await assert.rejects(client.requestHira(query, { ...options, timeoutMs: 5, token: () => new Promise(() => {}) }), e => e.code === 'TIMEOUT');
  const controller = new AbortController(); const pending = client.requestHira(query, { ...options, signal: controller.signal, token: () => new Promise(() => {}) }); controller.abort();
  await assert.rejects(pending, e => e.code === 'CANCELLED');
  await assert.rejects(client.requestHira(query, { ...options, transport: async () => new Response('x'.repeat(200001)) }), e => e.code === 'RESPONSE');
});

function mountLookup(lookup) {
  const slots = [], effects = []; let cursor = 0, dirty = true, disposed = false, state, background, blur;
  const depsChanged = (old, deps) => !old || deps.some((v, i) => v !== old.deps[i]);
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { if (disposed) return; slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (depsChanged(slots[i], deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (depsChanged(slots[i], deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const module = loader({ react: hooks, 'react-native': { AppState: { addEventListener: (_name, fn) => { background = fn; return { remove() {} }; } } },
    'expo-router': { useFocusEffect: fn => hooks.useEffect(() => { blur = fn(); return blur; }, [fn]) },
    '../../services/hira': { lookupHira: lookup, hiraErrorMessage: e => e.message } })('features/places/useHiraLookup.ts');
  function render() { let n = 0; while (dirty && !disposed) { assert.ok(n++ < 30); dirty = false; cursor = 0; state = module.useHiraLookup(); while (effects.length) effects.shift()(); } }
  render(); return { get state() { render(); return state; }, background: value => background(value), blur: () => blur(), dispose() { disposed = true; for (const slot of slots) slot?.cleanup?.(); } };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('reference hook blocks duplicate sends, discards reset/blur results, and does not request on mount', async () => {
  const pending = deferred(); let calls = 0, signal;
  const app = mountLookup(async (_query, s) => { calls++; signal = s; return pending.promise; });
  assert.equal(calls, 0); const first = app.state.run(query); await app.state.run(query); assert.equal(calls, 1);
  app.state.reset(); assert.equal(signal.aborted, true); pending.resolve(page); await first; assert.equal(app.state.result, null); assert.equal(app.state.loading, false);
  app.dispose();
  const old = deferred(); const other = mountLookup(async () => old.promise); const task = other.state.run(query); other.state; other.blur(); old.resolve(page); await task;
  assert.equal(other.state.result, null); assert.equal(other.state.loading, false); other.dispose();
});

test('reference pagination deduplicates across pages and failure retry preserves prior results', async () => {
  let count = 0; const requests = [];
  const app = mountLookup(async q => { requests.push(q.page ?? 1); count++; if (count === 2) throw Error('fixture failure'); return count === 1 ? { ...page, total: 3, hasMore: true } : { ...page, page: 2, total: 3, hasMore: true }; });
  await app.state.run(query); app.state.more(); await new Promise(resolve => setImmediate(resolve)); assert.equal(app.state.result.items.length, 1); assert.equal(app.state.error, 'fixture failure');
  app.state.retry(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(requests, [1, 2, 2]); assert.equal(app.state.result.items.length, 1); app.dispose();
});

test('reference UI labels HIRA data, fills medical query only by explicit choice and requests GPS only through its action', async () => {
  const runs = [], chosen = []; let locations = 0;
  const state = { result: page, loading: false, error: null, reset() {}, run: q => runs.push(q), retry() {}, more() {}, cancel() {} };
  const { HiraReferencePanel } = loader({ react: { useState: initial => [initial, () => {}] }, 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Linking: { openURL: async () => {} } },
    './DiseaseReferenceCard': { DiseaseReferenceCard: 'DiseaseReferenceCard' }, './ui': { Action: 'Action', Field: 'Field', StatusMessage: 'StatusMessage', C: {}, s: {} }, '../features/places/useHiraLookup': { useHiraLookup: () => state },
    '../services/rag': { ragConfigured: () => true }, '../services/placeLocation': { currentPlaceLocation: async () => { locations++; return { latitude: 37, longitude: 127 }; } }, '../services/hiraClient': client })('components/HiraReferencePanel.tsx');
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  const all = nodes(HiraReferencePanel({ kind: 'disease', onChooseName: name => chosen.push(name) })); assert.equal(runs.length, 0);
  const card = all.find(n => n.type === 'DiseaseReferenceCard'); card.props.onChooseName(card.props.item.name); assert.deepEqual(chosen, ['합성 질병명']); assert.equal(runs.length, 0);
  state.result = null; const hospitals = nodes(HiraReferencePanel({ kind: 'hospital' })); assert.equal(locations, 0);
  hospitals.find(n => n.props?.label === '현재 위치로 공공병원 조회').props.onPress(); assert.equal(locations, 0);
  const prepared = await runs[0](); assert.equal(locations, 1); assert.equal(prepared.kind, 'hospital');
});
