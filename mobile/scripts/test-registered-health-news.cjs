// Mocked transport and authored non-medical records only; no credentials/network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function client(token, transport, timers = { setTimeout, clearTimeout }) {
  const news = { exports: {} }; vm.runInNewContext(compile('src/services/healthNews.ts'), { ...news, URL, Date });
  const box = { exports: {}, URL, Date, AbortController, ...timers, __DEV__: false,
    process: { env: { EXPO_PUBLIC_RAG_API_URL: 'https://rag.example.org' } }, fetch: transport,
    require: name => ({ './auth': { readToken: token }, './ragClient': { validateRagBaseUrl: value => value }, './healthNews': news.exports })[name] };
  vm.runInNewContext(compile('src/services/registeredHealthNews.ts'), box); return box.exports.loadRegisteredHealthNews;
}
test('registered home client calls only DrMAS with an empty authenticated body and rejects expired material', async () => {
  let calls = 0;
  const load = client(async () => 'synthetic-session', async (url, request) => {
    calls++; assert.equal(url.href, 'https://rag.example.org/api/rag/health-info'); assert.equal(request.method, 'POST');
    assert.equal(request.body, '{}'); assert.equal(request.headers.Authorization, 'Bearer synthetic-session');
    return { ok: true, json: async () => ({ items: [{ contentId: 'synthetic', title: 'Synthetic record', publisher: 'Test only', category: 'Test', sourceUrl: 'https://example.org', verification: 'verified', validUntil: '2020-01-01' }] }) };
  });
  assert.equal((await load(new AbortController().signal)).length, 0); assert.equal(calls, 1);
  await assert.rejects(client(async () => null, async () => { throw Error('must not call'); })(new AbortController().signal), /HEALTH_NEWS_UNAVAILABLE/);
});
test('home client timeout settles even while session lookup never resolves', async () => {
  const load = client(() => new Promise(() => {}), async () => { throw Error('must not call'); }, { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout() {} });
  await assert.rejects(load(new AbortController().signal), /HEALTH_NEWS_UNAVAILABLE/);
});
