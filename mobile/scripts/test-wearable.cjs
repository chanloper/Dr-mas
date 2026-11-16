/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  assert.match(name, /^\.\/(contract|monitor|simulator)$/);
  const file = path.join(__dirname, '../src/features/wearable', name + '.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', source)(exports, load);
  modules.set(name, exports);
  return exports;
}

const { createWearableSimulator } = load('./simulator');
const { createWearableMonitor } = load('./monitor');
const now = Date.parse('2026-11-10T00:00:00.000Z');
const rules = { maxAgeMs: 5000, gapMs: 2000 };
const iso = ms => new Date(ms).toISOString();

test('rejects malformed, ambiguous, future, stale, and wrong-consent readings', async () => {
  const adapter = createWearableSimulator(now);
  const monitor = createWearableMonitor(adapter, rules);
  const [sample, steps] = await adapter.read();
  for (const record of [
    null, { ...sample, version: 2 }, { ...sample, value: Infinity },
    { ...steps, value: 0.5 }, { ...sample, unit: 'steps' },
    { ...sample, quality: 'uncertain' }, { ...sample, quality: 'invalid' },
    { ...sample, measuredAt: '2026-02-30T00:00:00.000Z' },
    { ...sample, receivedAt: iso(now - 1) }, { ...sample, receivedAt: iso(now + 1) },
    { ...sample, provenance: { ...sample.provenance, origin: 'provider' } },
  ]) assert.equal(monitor.ingest(record, now).status, 'invalid');
  assert.equal(monitor.ingest(sample, now + 5001).status, 'stale');
  assert.equal(monitor.ingest({ ...sample, provenance: { ...sample.provenance, consentId: 'other' } }, now).status, 'unavailable');
  assert.equal(monitor.ingest({ ...sample, source: { ...sample.source, streamId: 'other' } }, now).status, 'unavailable');
  assert.equal(monitor.ingest(sample, now).status, 'sample');
});

test('isolates metric ordering and reports gaps without extrapolating a baseline', async () => {
  const adapter = createWearableSimulator(now);
  const monitor = createWearableMonitor(adapter, {
    ...rules, baseline: { 'heart-rate': { value: 72, deviation: 10 } },
  });
  const [sample, steps] = await adapter.read();
  const at = (offset, value, id) => ({
    ...sample, id, value, measuredAt: iso(now + offset), receivedAt: iso(now + offset),
  });
  assert.deepEqual(monitor.ingest(sample, now), { status: 'sample', gap: false, baseline: 'within' });
  assert.equal(monitor.ingest(steps, now).status, 'sample');
  assert.equal(monitor.ingest(sample, now).status, 'duplicate');
  assert.deepEqual(monitor.ingest(at(1000, 95, 'second'), now + 1000),
    { status: 'sample', gap: false, baseline: 'deviation' });
  assert.equal(monitor.ingest(at(500, 73, 'late'), now + 1000).status, 'out-of-order');
  assert.deepEqual(monitor.ingest(at(3500, 96, 'after-gap'), now + 3500),
    { status: 'sample', gap: true, baseline: 'unavailable' });
});

test('simulated falls require simulator evidence and explicit single-use confirmation', async () => {
  const adapter = createWearableSimulator(now, true);
  const monitor = createWearableMonitor(adapter, rules);
  const records = await adapter.read();
  const fall = records.find(record => record.metric === 'fall-event');
  assert.equal(monitor.ingest({ ...fall }, now).status, 'unverified');
  const result = monitor.ingest(fall, now);
  assert.equal(result.status, 'confirm-fall');
  assert.equal(result.prompt.kind, 'simulator');
  assert.equal(monitor.resolveFall({ ...result.prompt }, 'confirm', now), 'unavailable');
  assert.equal(monitor.resolveFall(result.prompt, 'confirm', now), 'simulation-confirmed');
  assert.equal(monitor.resolveFall(result.prompt, 'confirm', now), 'unavailable');
  assert.equal(monitor.ingest(fall, now).status, 'duplicate');
  const dismissMonitor = createWearableMonitor(adapter, rules);
  const dismissal = dismissMonitor.ingest(fall, now);
  assert.equal(dismissMonitor.resolveFall(dismissal.prompt, 'dismiss', now), 'dismissed');
  assert.equal(dismissMonitor.resolveFall(dismissal.prompt, 'confirm', now), 'unavailable');
});

test('future device path rechecks permission, consent, and freshness before returning a manual-only offer', async () => {
  const simulator = createWearableSimulator(now, true);
  const simulated = (await simulator.read()).find(record => record.metric === 'fall-event');
  const source = { kind: 'device', provider: 'test-provider', streamId: 'test-stream' };
  const fall = { ...simulated, source, provenance: { consentId: 'test-consent', origin: 'provider' } };
  const ready = {
    capabilities: ['fall-event'], permissions: { 'fall-event': 'granted' },
    connection: 'connected', freshness: 'fresh', consentId: 'test-consent',
  };
  let status = ready;
  const adapter = {
    source, getStatus: () => status, read: async () => [fall], verifiesFall: input => input === fall,
  };
  const monitor = createWearableMonitor(adapter, rules);
  assert.equal(monitor.ingest(simulated, now).status, 'unavailable');
  assert.equal(monitor.ingest({ ...fall }, now).status, 'unverified');
  for (const blocked of [
    { connection: 'disconnected' }, { freshness: 'stale' }, { permissions: {} }, { capabilities: [] },
    { consentId: null },
  ]) {
    const session = createWearableMonitor(adapter, rules);
    const event = session.ingest(fall, now);
    assert.equal(event.status, 'confirm-fall');
    status = { ...ready, ...blocked };
    assert.equal(session.resolveFall(event.prompt, 'confirm', now), 'unavailable');
    status = ready;
    assert.equal(session.resolveFall(event.prompt, 'confirm', now), 'unavailable');
  }
  const expired = createWearableMonitor(adapter, rules);
  assert.equal(expired.resolveFall(expired.ingest(fall, now).prompt, 'confirm', now + 5001), 'unavailable');
  const result = monitor.ingest((await adapter.read())[0], now);
  assert.equal(monitor.resolveFall(result.prompt, 'confirm', now), 'offer-existing-manual-sos');
});
