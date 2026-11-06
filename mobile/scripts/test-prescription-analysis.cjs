// Synthetic data and injected transport only: never reads .env or calls a provider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function loader(overrides = {}, env = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { exports, URL, Request, Response, AbortController, TextEncoder, TextDecoder, Uint8Array, atob, setTimeout, clearTimeout, process: { env },
      require: key => overrides[key] ?? load(path.resolve(path.dirname(file), key.endsWith('.ts') ? key : key + '.ts')),
    });
    return exports;
  }
  return load;
}
const contract = loader()('mobile/src/services/durContract.ts');
const drugs = [{ name: '합성약품가정', itemSeq: '999000001' }, { name: '합성약품나정', itemSeq: '999000002' }];
const rows = [
  { ITEM_NAME: drugs[0].name, ITEM_SEQ: drugs[0].itemSeq, MIXTURE_ITEM_SEQ: drugs[1].itemSeq, PROHBT_CONTENT: '합성 시험용 병용금기 내용' },
  { ITEM_NAME: drugs[1].name, ITEM_SEQ: drugs[1].itemSeq, MIXTURE_ITEM_SEQ: drugs[0].itemSeq, PROHBT_CONTENT: '합성 시험용 병용금기 내용' },
];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(options = {}) {
  const calls = [];
  const env = { DUR_ENABLED: 'true', MFDS_DUR_SERVICE_KEY: 'synthetic%2Bkey%3D', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', DUR_ALLOWED_ORIGINS: 'https://web.invalid', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'synthetic-redis', ...options.env };
  const handler = loader()('supabase/functions/check-dur/handler.ts').createHandler({ env: key => env[key], fetch: async (url, init) => {
    const target = new URL(url); calls.push({ url: target, init });
    if (target.hostname.endsWith('supabase.co')) return json({ id: 'synthetic-user', ...(options.anonymous ? { is_anonymous: true } : {}) }, options.authStatus ?? 200);
    if (target.hostname.endsWith('upstash.io')) return json({ result: options.admission ?? 1 });
    if (options.fail) throw Error('PRIVATE_PROVIDER_ERROR');
    const items = options.rows ?? rows.filter(x => x.ITEM_NAME === target.searchParams.get('itemName'));
    return json(options.response ?? { header: { resultCode: '00' }, body: { items, totalCount: options.total ?? items.length } });
  } });
  const request = (body = { drugs }, headers = {}) => new Request('https://fixture.supabase.co/functions/v1/check-dur', { method: 'POST', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { calls, handler, request };
}
test('mobile and server contracts stay identical; Edge handler typechecks', () => {
  assert.equal(fs.readFileSync(path.join(root, 'mobile/src/services/durContract.ts'), 'utf8'), fs.readFileSync(path.join(root, 'supabase/functions/_shared/durContract.ts'), 'utf8'));
  const program = ts.createProgram([path.join(root, 'supabase/functions/check-dur/handler.ts')], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] });
  assert.equal(ts.getPreEmitDiagnostics(program).map(x => ts.flattenDiagnosticMessageText(x.messageText, '\n')).join('\n'), '');
});
test('draft parser allows only bounded unique medicine names and optional codes', () => {
  assert.equal(contract.parseDurDraft('합성약품가정 | 999000001\n합성약품나정').length, 2);
  for (const input of [[], [...drugs, ...drugs], [{ name: '합성약품', image: 'forbidden' }], [{ name: '합성약품', itemSeq: 'abc' }], [{ name: '900101-1234567' }]]) assert.throws(() => contract.validateDurDrugs(input));
});
test('disabled server and invalid authentication never call DUR', async () => {
  const disabled = fixture({ env: { DUR_ENABLED: '' } }); assert.equal((await disabled.handler(disabled.request())).status, 503); assert.equal(disabled.calls.length, 0);
  for (const settings of [{ authStatus: 401 }, { anonymous: true }]) {
    const f = fixture(settings); assert.equal((await f.handler(f.request())).status, 401); assert.equal(f.calls.length, 1);
  }
});
test('image bodies and unexpected fields rejected; origin fail closed', async () => {
  const f = fixture(); assert.equal((await f.handler(f.request({ drugs, image: 'forbidden' }))).status, 400);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.handler(f.request({ drugs }, { origin: 'https://evil.invalid' }))).status, 403);
});
test('exact primary and counterpart codes produce reference warnings only', async () => {
  const f = fixture(); const response = await f.handler(f.request()); assert.equal(response.status, 200);
  const result = contract.validateDurResult(await response.json());
  assert.equal(result.status, 'reference_only'); assert.equal(result.warnings.length, 1);
  assert.equal(result.drugs.every(x => x.identityConfirmed), true);
  assert.equal(f.calls.find(c => c.url.hostname === 'apis.data.go.kr').url.searchParams.get('serviceKey'), 'synthetic+key=');
  assert.equal(JSON.stringify(result).includes('synthetic+key'), false);
});
test('names alone offer candidates without confirmed identity or matched warnings', async () => {
  const f = fixture(); const result = await (await f.handler(f.request({ drugs: drugs.map(d => ({ name: d.name })) }))).json();
  assert.equal(result.warnings.length, 0); assert.equal(result.drugs[0].identityConfirmed, false); assert.equal(result.drugs[0].candidates.length, 1);
});
test('wrong codes, similar names and nonmatching counterpart never become a pair', async () => {
  const f = fixture({ rows: [{ ...rows[0], MIXTURE_ITEM_SEQ: '999000099' }, { ...rows[1], ITEM_NAME: '다른함량' }] });
  const result = await (await f.handler(f.request())).json(); assert.equal(result.warnings.length, 0); assert.equal(result.drugs[1].identityConfirmed, false);
});
test('empty and truncated results remain reference-only and unresolved', async () => {
  const empty = fixture({ rows: [] }); const e = await (await empty.handler(empty.request())).json();
  assert.equal(e.status, 'reference_only'); assert.equal(e.warnings.length, 0); assert.equal(e.drugs[0].identityConfirmed, false);
  const partial = fixture({ total: 250 }); const p = await (await partial.handler(partial.request())).json(); assert.equal(p.drugs[0].truncated, true);
});
test('provider failure/error envelope produces fixed code without raw errors', async () => {
  for (const options of [{ fail: true }, { response: { header: { resultCode: '30', resultMsg: 'PRIVATE_PROVIDER_ERROR' } } }, { response: { header: { resultCode: '00' }, body: { totalCount: 1, items: [] } } }]) {
    const f = fixture(options); const r = await f.handler(f.request()); assert.ok(r.status >= 500); const text = await r.text(); assert.equal(text.includes('PRIVATE'), false); assert.equal(text.includes('key'), false);
  }
});
test('client uses existing verified JWT; sends medicine identifiers only', async () => {
  let sent;
  const result = { status: 'reference_only', drugs: drugs.map(d => ({ ...d, identityConfirmed: false, truncated: false, candidates: [] })), warnings: [] };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic' } } }), getSession: async () => ({ data: { session: { user: { id: 'synthetic' }, access_token: 'synthetic-user-token' } } }) }, functions: { invoke: async (name, options) => { sent = { name, options }; return { data: result }; } } };
  const api = loader({ './supabase': { getSupabaseClient: () => client } }, { EXPO_PUBLIC_DUR_ENABLED: '1' })('mobile/src/services/prescriptionAnalysis.ts');
  await api.checkPrescriptionDur(drugs, new AbortController().signal);
  assert.equal(sent.name, 'check-dur'); assert.equal(sent.options.headers.Authorization, 'Bearer synthetic-user-token'); assert.equal(Object.keys(sent.options.body).join(','), 'drugs');
});
test('client defaults disconnected and rejects invalid response', async () => {
  const closed = loader({ './supabase': { getSupabaseClient: () => { throw Error('must not initialize'); } } })('mobile/src/services/prescriptionAnalysis.ts');
  await assert.rejects(closed.checkPrescriptionDur(drugs, new AbortController().signal), /아직 연결/);
  assert.throws(() => contract.validateDurResult({ status: 'safe', drugs: [], warnings: [] }));
});
test('shared quota counts each provider lookup with separate DUR buckets; exhausted limiter blocks provider', async () => {
  const f = fixture(); await f.handler(f.request());
  const redis = f.calls.filter(c => c.url.hostname.endsWith('upstash.io'));
  assert.equal(redis.length, 2);
  const command = JSON.parse(redis[0].init.body); assert.equal(command[3].startsWith('drmas:dur:minute:'), true);
  const denied = fixture({ admission: 0 }); assert.equal((await denied.handler(denied.request())).status, 429);
  assert.equal(denied.calls.some(c => c.url.hostname === 'apis.data.go.kr'), false);
  const missing = fixture({ env: { UPSTASH_REDIS_REST_TOKEN: '' } }); assert.equal((await missing.handler(missing.request())).status, 503);
});
test('wrapped JSON, item wrapper, string total and numeric product codes normalize conservatively', async () => {
  const row = { ...rows[0], ITEM_SEQ: Number(rows[0].ITEM_SEQ), MIXTURE_ITEM_SEQ: Number(rows[0].MIXTURE_ITEM_SEQ) };
  const f = fixture({ response: { response: { header: { resultCode: '00' }, body: { totalCount: '1', items: { item: row } } } } });
  const result = await (await f.handler(f.request())).json();
  assert.equal(result.drugs[0].identityConfirmed, true); assert.equal(result.drugs[1].identityConfirmed, false); assert.equal(result.warnings.length, 0);
});
test('platform anon key fallback accepted; service-role credential rejected', async () => {
  const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;
  const f = fixture({ env: { SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_ANON_KEY: jwt('anon') } }); assert.equal((await f.handler(f.request())).status, 200);
  const blocked = fixture({ env: { SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_ANON_KEY: jwt('service_role') } }); assert.equal((await blocked.handler(blocked.request())).status, 503); assert.equal(blocked.calls.length, 0);
});
test('medicine search returns distinct provider products, optional metadata and bounded pagination', async () => {
  const f = fixture({ total: 250, rows: [rows[0], rows[0], { ...rows[1], ENTP_NAME: '합성제약', INGR_KOR_NAME: '합성성분' }] });
  const result = contract.validateDurSearchResult(await (await f.handler(f.request({ mode: 'search', query: '합성약품', page: 2 }))).json());
  assert.equal(result.candidates.length, 2); assert.equal(result.candidates[0].manufacturer, null); assert.equal(result.candidates[1].ingredient, '합성성분');
  assert.equal(result.hasMore, true); assert.equal(result.truncated, true);
  const url = f.calls.find(c => c.url.hostname === 'apis.data.go.kr').url;
  assert.equal(url.searchParams.get('pageNo'), '2'); assert.equal(url.searchParams.get('itemName'), '합성약품');
  const last = fixture({ total: 1000 });
  const page3 = await (await last.handler(last.request({ mode: 'search', query: drugs[0].name, page: 3 }))).json();
  assert.equal(page3.hasMore, false); assert.equal(page3.truncated, true);
});
test('search input cannot carry image/identity fields or unbounded pages; empty results never mean safe', async () => {
  const f = fixture({ rows: [] });
  for (const body of [{ mode: 'search', query: 'x', page: 1 }, { mode: 'search', query: '합성약품', page: 4 }, { mode: 'search', query: '합성약품', page: 1, image: 'forbidden' }]) assert.equal((await f.handler(f.request(body))).status, 400);
  assert.equal(f.calls.some(c => c.url.hostname === 'apis.data.go.kr'), false);
  const empty = contract.validateDurSearchResult(await (await f.handler(f.request({ mode: 'search', query: '합성약품', page: 1 }))).json());
  assert.equal(empty.status, 'reference_only'); assert.equal(empty.candidates.length, 0);
});
test('pair warnings are distinct from registration notices and reverse duplicates are removed', async () => {
  const f = fixture({ rows: [rows[0]] }); const result = contract.validateDurResult(await (await f.handler(f.request())).json());
  assert.equal(result.warnings.length, 0); assert.equal(result.notices.length, 1); assert.equal(result.notices[0].counterpart, null);
  const paired = fixture(); const pair = await (await paired.handler(paired.request())).json(); assert.equal(pair.warnings.length, 1); assert.equal(pair.notices.length, 2);
});
test('client search uses user JWT and detects a mismatched server response; known errors stay safe', async () => {
  const empty = { status: 'reference_only', query: '합성약품', page: 1, candidates: [], hasMore: false, truncated: false, checkedAt: new Date().toISOString() };
  let sent; let output = { data: empty };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic' } } }), getSession: async () => ({ data: { session: { user: { id: 'synthetic' }, access_token: 'synthetic-token' } } }) }, functions: { invoke: async (_, options) => { sent = options; return output; } } };
  const api = loader({ './supabase': { getSupabaseClient: () => client } }, { EXPO_PUBLIC_DUR_ENABLED: '1' })('mobile/src/services/prescriptionAnalysis.ts');
  await api.searchPrescriptionDrugs('합성약품', 1, new AbortController().signal); assert.equal(sent.body.mode, 'search'); assert.equal(sent.body.query, '합성약품');
  output = { data: { ...empty, query: '다른약품' } }; await assert.rejects(api.searchPrescriptionDrugs('합성약품', 1, new AbortController().signal));
  output = { error: { context: new Response('{}', { status: 429 }), message: 'PRIVATE_TOKEN' } };
  await assert.rejects(api.searchPrescriptionDrugs('합성약품', 1, new AbortController().signal), error => error.code === 'RATE_LIMITED' && !error.message.includes('PRIVATE'));
});

function searchUI(service) {
  const slots = [], effects = []; let cursor = 0, tree; const cleanups = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(() => cleanups.push(effect())); } },
  };
  const jsx = (type, props) => ({ type, props });
  const load = loader({ react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Text:'Text', View:'View', Switch:'Switch', Linking: { openURL: async () => {} } }, './ui': { Action:'Action', Chip:'Chip', Field:'Field', StatusMessage:'StatusMessage', s:{} }, '../services/prescriptionAnalysis': { durConfigured: () => true, searchPrescriptionDrugs: service } });
  const component = load('mobile/src/components/DurMedicineSearch.tsx').DurMedicineSearch;
  const props = { selected: [], onSelect: () => {} };
  function render() { cursor = 0; tree = component(props); while (effects.length) effects.shift()(); return tree; }
  function nodes(value) { if (!value) return []; if (Array.isArray(value)) return value.flatMap(nodes); if (typeof value !== 'object') return []; return [value, ...nodes(value.props?.children)]; }
  const find = (type, label) => nodes(tree).find(n => n.type === type && (!label || n.props.label === label));
  render(); return { render, find, dispose: () => cleanups.forEach(fn => fn?.()) };
}
const uiResult = query => ({ status:'reference_only', query, page:1, candidates:[], hasMore:false, truncated:false, checkedAt:new Date().toISOString() });
test('medicine search UI requires consent and blocks duplicate presses', async () => {
  let finish, calls = 0;
  const ui = searchUI(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  ui.find('Field').props.onChangeText('합성약품'); ui.render();
  assert.equal(ui.find('Action', '의약품 검색').props.disabled, true);
  await ui.find('Action', '의약품 검색').props.onPress(); assert.equal(calls, 0);
  ui.find('Switch').props.onValueChange(true); ui.render();
  ui.find('Action', '의약품 검색').props.onPress(); ui.find('Action', '의약품 검색').props.onPress(); assert.equal(calls, 1);
  finish(uiResult('합성약품')); await new Promise(setImmediate); ui.render(); assert.equal(ui.find('Action', '의약품 검색').props.disabled, false); ui.dispose();
});
test('medicine search UI discards canceled and stale responses and supports retry', async () => {
  let finish, calls = 0;
  const ui = searchUI(() => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.reject(Error('합성 연결 오류')); });
  ui.find('Field').props.onChangeText('합성약품'); ui.find('Switch').props.onValueChange(true); ui.render();
  ui.find('Action', '의약품 검색').props.onPress(); ui.render(); ui.find('Action', '의약품 검색 취소').props.onPress();
  finish(uiResult('합성약품')); await new Promise(setImmediate); ui.render(); assert.equal(ui.find('StatusMessage'), undefined);
  ui.find('Action', '의약품 검색').props.onPress(); await new Promise(setImmediate); ui.render();
  assert.ok(ui.find('Action', '의약품 검색 다시 시도')); ui.find('Action', '의약품 검색 다시 시도').props.onPress(); await new Promise(setImmediate); assert.equal(calls, 3); ui.dispose();
});
