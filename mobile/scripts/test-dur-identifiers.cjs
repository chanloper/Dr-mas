/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function load(file) {
  file = path.resolve(__dirname, '../..', file);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Request, Response, AbortController, TextEncoder, TextDecoder, Uint8Array, atob, Date, setTimeout, clearTimeout,
      require: key => load(path.resolve(path.dirname(file), key)) });
  return exports;
}
const drugs = [{ name: 'Synthetic Alpha', itemSeq: '999000001' }, { name: 'Synthetic Beta', itemSeq: '999000002' }];
async function run(emptyReason, mismatch = false, expected = 1, reasonOverride) {
  let calls = 0;
  const env = { DUR_ENABLED: 'true', MFDS_DUR_SERVICE_KEY: 'synthetic-secret', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'synthetic-redis-secret' };
  const json = v => new Response(JSON.stringify(v));
  const handler = load('supabase/functions/check-dur/handler.ts').createHandler({ env: k => env[k], fetch: async url => {
    const u = new URL(url);
    if (u.hostname.endsWith('supabase.co')) return json({ id: 'synthetic-user' });
    if (u.hostname.endsWith('upstash.io')) return json({ result: 1 });
    calls++;
    const i = drugs.findIndex(d => d.itemSeq === u.searchParams.get('itemSeq'));
    return json({ header: { resultCode: '00' }, body: { totalCount: 1, items: [{ ITEM_SEQ: drugs[i].itemSeq, ITEM_NAME: drugs[i].name,
      INGR_CODE: i ? 'D900002' : 'D900001', MIXTURE_INGR_CODE: i ? 'D900001' : 'D900002', MIXTURE_ITEM_SEQ: emptyReason ? drugs[1-i].itemSeq : '999000099',
      FORM_CODE: '010201', MIXTURE_FORM_CODE: mismatch ? '010101' : '010201',
      PROHBT_CONTENT: reasonOverride ?? (emptyReason ? '' : 'Synthetic reason'), DUR_SEQ: '90001', MIXTURE_DUR_SEQ: '90002',
      serviceKey: 'synthetic-secret', irrelevant: 'not returned' }] } });
  } });
  const response = await handler(new Request('https://fixture.supabase.co/functions/v1/check-dur', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ drugs }) }));
  assert.equal(response.status, 200); assert.equal(calls, 2);
  const result = await response.json();
  assert.equal(result.warnings.length, expected);
  assert.equal(result.providerEvidence.every(e => e.complete && e.relevantRowCount === 1), true);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['synthetic-secret', 'synthetic-redis-secret', 'synthetic-user', 'not returned', 'serviceKey']) assert.equal(serialized.includes(forbidden), false);
  return result;
}
test('official exact ingredient and formulation codes match despite different counterpart product', async () => {
  const r = await run(false);
  assert.equal(r.providerEvidence[0].rows[0].MIXTURE_ITEM_SEQ, '999000099');
  assert.equal(r.providerEvidence[0].rows[0].MIXTURE_INGR_CODE, 'D900002');
  assert.equal(r.providerEvidence[0].rows[0].reasonPresent, true);
});
test('exact product association with blank reason remains a contraindication with missing-reason notice', async () => {
  const r = await run(true);
  assert.equal(r.providerEvidence[0].rows[0].MIXTURE_ITEM_SEQ, drugs[1].itemSeq);
  assert.equal(r.providerEvidence[0].rows[0].reasonPresent, false);
  assert.match(r.warnings[0].content, /API/);
});

test('ingredient code alone does not override a different formulation', async () => { await run(false, true, 0); });

test('non-displayable official reason cannot erase exact identifier contraindication', async () => {
  const r = await run(false, false, 1, 'Synthetic reason\nwith newline');
  assert.equal(r.providerEvidence[0].rows[0].reasonState, 'not_displayable');
  assert.equal(r.warnings[0].content.includes('Synthetic'), false);
});
