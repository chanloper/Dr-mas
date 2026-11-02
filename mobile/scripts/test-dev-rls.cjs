const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfiguration, probe } = require('./verify-dev-rls.cjs');
test('read-only Dev harness refuses missing or mismatched target before authentication', () => {
  const config = { EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'fixture-dev', EXPO_PUBLIC_SUPABASE_URL: 'https://fixture-dev.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
  assert.equal(validateConfiguration(config).url, 'https://fixture-dev.supabase.co');
  for (const change of [{ EXPO_PUBLIC_APP_ENV: 'production' }, { EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'other' }, { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' }, { EXPO_PUBLIC_SUPABASE_URL: 'https://user:fixture@fixture-dev.supabase.co' }]) assert.throws(() => validateConfiguration({ ...config, ...change }));
});
function client(owner, leak = false, fixtures = true) {
  return { from(table) {
    const filters = {};
    const chain = { select() { return chain; }, eq(k, v) { filters[k] = v; return chain; }, limit() { return chain; }, then(resolve, reject) {
      let data = [];
      if (owner === 'anon') return Promise.resolve({ data: null, error: { code: '42501' }, status: 403 }).then(resolve, reject);
      if (table === 'profiles' && (owner === filters.id || leak)) data = [{ id: filters.id, role: 'patient' }];
      if (table === 'medications' && owner === 'B' && fixtures) data = [{ id: 'fixture-id' }];
      if (table === 'medication_records' && owner === 'B' && fixtures) data = [{ medication_id: 'fixture-id', day: '2026-11-01' }];
      return Promise.resolve({ data, error: null, status: 200 }).then(resolve, reject);
    } }; return chain;
  } };
}
test('read-only probe detects leakage and does not claim fixture-less medication checks passed', async () => {
  const output = []; await probe(client('A'), client('B'), client('anon'), ['A', 'B'], (s, n) => output.push([s, n]));
  assert.ok(output.some(([s, n]) => s === 'PASS' && n === 'A_cannot_read_B_existing_record'));
  await assert.rejects(probe(client('A', true), client('B'), client('anon'), ['A', 'B'], () => {}));
  const incomplete = []; await probe(client('A'), client('B', false, false), client('anon'), ['A', 'B'], (s, n) => incomplete.push([s, n]));
  assert.ok(incomplete.some(([s]) => s === 'UNVERIFIED'));
});
