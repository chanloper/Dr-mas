/* global __dirname */
// Synthetic transport and manual deadline only; no environment files or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function modules(timers = []) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, '../..', relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, URL, Request, Response, AbortController, TextEncoder, TextDecoder, Uint8Array, atob, Date,
      setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, clearTimeout: t => { t.cleared = true; },
      require: key => load(path.resolve(path.dirname(file), key.endsWith('.ts') ? key : key + '.ts')) });
    return exports;
  }
  return load;
}
const drugs = [{ name: '합성가정', itemSeq: '999000001' }, { name: '합성나정', itemSeq: '999000002' }];
const json = value => new Response(JSON.stringify(value));
const env = { DUR_ENABLED: 'true', MFDS_DUR_SERVICE_KEY: 'synthetic', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'synthetic' };
const request = () => new Request('https://fixture.supabase.co/functions/v1/check-dur', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ drugs }) });
function rowPage(url) {
  const own = drugs.find(d => d.itemSeq === url.searchParams.get('itemSeq'));
  const other = drugs.find(d => d !== own), page = Number(url.searchParams.get('pageNo'));
  const row = { ITEM_NAME: own.name, ITEM_SEQ: own.itemSeq, MIXTURE_ITEM_SEQ: page === 2 ? other.itemSeq : '999000099', PROHBT_CONTENT: page === 2 ? '합성 정확한 사유' : '합성 기타 사유' };
  return json({ header: { resultCode: '00' }, body: { totalCount: 101, items: Array.from({ length: page === 1 ? 100 : 1 }, () => row) } });
}

test('only exact project DUR POST gets 45s; operation 50s remains bounded; other APIs keep 15s', () => {
  const api = modules()('mobile/src/services/supabaseRequestTimeout.ts');
  const base = 'https://fixture.supabase.co';
  assert.equal(api.supabaseRequestTimeout(base + '/functions/v1/check-dur', { method: 'POST' }, base), 45000);
  assert.equal(api.supabaseRequestTimeout(new Request(base + '/functions/v1/check-dur', { method: 'POST' }), undefined, base), 45000);
  for (const [url, method] of [[base + '/auth/v1/user', 'GET'], [base + '/functions/v1/search-places', 'POST'], [base + '/functions/v1/check-dur/extra', 'POST'], ['https://other.supabase.co/functions/v1/check-dur', 'POST'], [base + '/functions/v1/check-dur', 'GET']]) assert.equal(api.supabaseRequestTimeout(url, { method }, base), 15000);
  assert.equal(api.DUR_OPERATION_TIMEOUT_MS, 50000);
});

test('round-robin pages stop after exact pair found; every provider request retains quota admission', async () => {
  const calls = [], timers = []; let admissions = 0;
  const handler = modules(timers)('supabase/functions/check-dur/handler.ts').createHandler({ env: k => env[k], fetch: async url => {
    const u = new URL(url);
    if (u.hostname.endsWith('supabase.co')) return json({ id: 'synthetic-user' });
    if (u.hostname.endsWith('upstash.io')) { admissions++; return json({ result: 1 }); }
    calls.push([u.searchParams.get('itemSeq'), u.searchParams.get('pageNo')]); return rowPage(u);
  } });
  const response = await handler(request()), result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [['999000001', '1'], ['999000002', '1'], ['999000001', '2']]);
  assert.equal(admissions, 3); assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].content, '합성 정확한 사유');
  assert.equal(result.drugs[1].truncated, true);
  assert.equal(timers[0].ms, 40000); assert.equal(timers[0].cleared, true);
});

test('server deadline preserves validated pages as incomplete instead of discarding them', async () => {
  const timers = []; let calls = 0;
  const handler = modules(timers)('supabase/functions/check-dur/handler.ts').createHandler({ env: k => env[k], fetch: async url => {
    const u = new URL(url);
    if (u.hostname.endsWith('supabase.co')) return json({ id: 'synthetic-user' });
    if (u.hostname.endsWith('upstash.io')) return json({ result: 1 });
    if (++calls === 1) return rowPage(u);
    return new Promise(() => {});
  } });
  const pending = handler(request());
  for (let i = 0; i < 50 && calls < 2; i++) await new Promise(setImmediate);
  assert.equal(calls, 2); timers[0].fn();
  const response = await pending, result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.warnings.length, 0);
  assert.equal(result.drugs.every(d => d.truncated), true);
  assert.equal(result.drugs[0].identityConfirmed, true); assert.equal(result.drugs[1].identityConfirmed, false);
});

test('quota denial after a collected page still returns 429, never a successful partial result', async () => {
  let admissions = 0, providerCalls = 0;
  const handler = modules()('supabase/functions/check-dur/handler.ts').createHandler({ env: k => env[k], fetch: async url => {
    const u = new URL(url);
    if (u.hostname.endsWith('supabase.co')) return json({ id: 'synthetic-user' });
    if (u.hostname.endsWith('upstash.io')) return json({ result: ++admissions === 1 ? 1 : 0 });
    providerCalls++; return rowPage(u);
  } });
  const response = await handler(request());
  assert.equal(response.status, 429); assert.equal((await response.json()).code, 'RATE_LIMITED'); assert.equal(providerCalls, 1);
});
