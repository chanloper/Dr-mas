const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    assert.ok(name.startsWith('.'), 'No external or network dependencies in simulator');
    return load(path.resolve(path.dirname(file), `${name}.ts`));
  });
  cache.set(file, exports); return exports;
}
const { createLiveSimulator } = load('src/features/wearable/liveSimulator.ts');
let now = Date.parse('2026-01-01T00:00:00Z');
const sim = createLiveSimulator('test-synthetic-only');
assert.equal(sim.tick(now, 10).bpm, null);
sim.start(); let frame = sim.tick(now, 10); assert.equal(frame.history.length, 1);
now += 2000; frame = sim.tick(now, 10); assert.equal(frame.history.length, 2);
assert.ok(frame.steps > 0 && frame.sleep > 0);
for (const scenario of ['exercise', 'high', 'low']) {
  sim.select(scenario); now += 2000; frame = sim.tick(now, 10);
  assert.equal(frame.scenario, scenario); assert.equal(frame.sosLeft, null);
}
sim.select('interrupted'); now += 7000; frame = sim.tick(now, 10);
assert.equal(frame.stale, true); assert.equal(frame.connection, 'connected');
sim.select('disconnect'); assert.equal(sim.tick(now, 10).connection, 'disconnected');
sim.select('reconnect'); now += 2000; assert.equal(sim.tick(now, 10).stale, false);
sim.select('fall'); now += 2000; assert.equal(sim.tick(now, 10).sosLeft, 10);
now += 1000; assert.equal(sim.tick(now, 60).sosLeft, 9);
sim.cancel(); assert.equal(sim.tick(now, 10).sosResult, 'cancelled');
sim.select('fall'); now += 2000; assert.equal(sim.tick(now, 60).sosLeft, 60);
now += 60000; assert.equal(sim.tick(now, 60).sosResult, 'completed');
sim.stop(); assert.equal(sim.tick(now, 10).connection, 'disconnected');
assert.equal(sim.adapter.source.kind, 'simulator');
// Reproduce web clicks immediately after a sample, not only on sample boundaries.
const immediate = createLiveSimulator('immediate-fall');
immediate.start(); immediate.tick(now, 37);
immediate.select('fall');
assert.equal(immediate.tick(now + 1, 37).sosLeft, 37);
assert.equal(immediate.tick(now + 1001, 10).sosLeft, 36);
immediate.cancel();
assert.equal(immediate.tick(now + 1002, 37).sosLeft, null);
for (let offset = 2002; offset <= 42002; offset += 2000) {
  const cancelled = immediate.tick(now + offset, 37);
  assert.equal(cancelled.sosLeft, null);
  assert.equal(cancelled.sosResult, 'cancelled');
}
immediate.select('fall');
assert.equal(immediate.tick(now + 43000, 10).sosLeft, 10);
assert.equal(immediate.tick(now + 53000, 10).sosResult, 'completed');
assert.equal(immediate.tick(now + 55000, 10).sosLeft, null);
const stopped = createLiveSimulator('stopped-fall');
stopped.select('fall');
assert.equal(stopped.tick(now, 60).sosLeft, 60);
console.log('PASS: generation, scenarios, interruption, reconnect, fall countdown/cancel/complete, synthetic isolation');
