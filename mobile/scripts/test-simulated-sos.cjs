// Synthetic IDs, local module mocks only. No network, Supabase or phone requests.
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const box = { exports: {} }; vm.runInNewContext(compile('src/services/sos.ts'), box);
const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'patient' };
test('simulation transmission is Dev gated, authenticated, sanitized and uses only the test RPC', async () => {
  const calls = [];
  let authId = actor.id, result = { data: 1, error: null };
  const client = { auth: { getUser: async () => ({ data: { user: { id: authId } }, error: null }) },
    rpc: async (name, args) => { calls.push({ name, args }); return result; } };
  await assert.rejects(box.exports.createSosRepository(client).sendSimulation(actor, 'event-1'), e => e.code === 'ROLE');
  assert.equal(calls.length, 0);
  const repo = box.exports.createSosRepository(client, () => true);
  authId = '22222222-2222-4222-8222-222222222222';
  await assert.rejects(repo.sendSimulation(actor, 'event-1'), e => e.code === 'AUTH');
  authId = actor.id;
  await assert.rejects(repo.sendSimulation(actor, 'invalid/event'), e => e.code === 'INPUT');
  assert.equal(calls.length, 0);
  assert.equal(await repo.sendSimulation(actor, 'event-1'), 1);
  assert.equal(calls[0].name, 'request_simulated_sos_alert');
  assert.equal(calls[0].args.event_id, 'event-1');
  assert.deepEqual(Object.keys(calls[0].args), ['event_id']);
  result = { data: null, error: { code: '42501', message: 'private detail' } };
  await assert.rejects(repo.sendSimulation(actor, 'event-2'), e => e.code === 'ROLE' && !e.message.includes('private'));
});
function mount(repo, initialCompleted = false) {
  let cursor = 0, dirty = true, tree, props = { actor, completed: initialCompleted,
    event: { id: 'test-event', occurredAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:10Z' } };
  const slots = [], effects = [];
  const hooks = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps[j])) {
      effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    } },
  };
  const context = { exports: {}, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return { View: 'View', Text: 'Text' };
    if (name.endsWith('/sos')) return { createSosRepository: () => repo, sosErrorMessage: () => 'DELIVERY_FAILED' };
    if (name.endsWith('/supabase')) return { getSupabaseClient: () => ({}) };
    if (name.endsWith('/sosTestEnvironment')) return { sosTestEnvironmentAllowed: () => true };
    if (name === './EmergencyCallButton') return { EmergencyCallButton: 'EmergencyCallButton' };
    if (name === './SosPanel') return { SosPanel: 'SosPanel' };
    if (name === './ui') return { Action: 'Action', StatusMessage: 'StatusMessage', s: {} };
    throw Error('Unexpected dependency');
  } };
  vm.runInNewContext(compile('src/components/SimulationSosBridge.tsx'), context);
  function render() { for (let n = 0; dirty; n++) { assert.ok(n < 20); dirty = false; cursor = 0;
    tree = context.exports.SimulationSosBridge(props); while (effects.length) effects.shift()(); } }
  function nodes() { render(); const out = []; function visit(n) { if (Array.isArray(n)) n.forEach(visit);
    else if (n && typeof n === 'object') { out.push(n); visit(n.props?.children); } } visit(tree); return out; }
  return { nodes, setCompleted(value) { props = { ...props, completed: value }; dirty = true; },
    async enable() { await nodes().find(n => n.props?.label === 'Dev 테스트 보호자 전달 사용').props.onPress(); await this.flush(); },
    async flush() { for (let n = 0; n < 6; n++) { render(); await new Promise(r => setImmediate(r)); } render(); } };
}
test('cancelled/incomplete countdown never transmits; completion transmits once and renders blocked 119 UI', async () => {
  let sends = 0;
  const app = mount({ testAvailable: async () => true, sendSimulation: async () => { sends++; return 1; } });
  await app.enable(); assert.equal(sends, 0);
  app.setCompleted(false); await app.flush(); assert.equal(sends, 0);
  app.setCompleted(true); await app.flush(); assert.equal(sends, 1);
  await app.flush(); assert.equal(sends, 1);
  assert.equal(app.nodes().find(n => n.type === 'EmergencyCallButton').props.testOnly, true);
  assert.equal(app.nodes().find(n => n.type === 'SosPanel').props.historyOnly, true);
});
test('unapproved/config-disabled accounts do not send; failures never render delivery success', async () => {
  let sends = 0;
  const blocked = mount({ testAvailable: async () => false, sendSimulation: async () => { sends++; } }, true);
  await blocked.enable(); assert.equal(sends, 0);
  const failed = mount({ testAvailable: async () => true, sendSimulation: async () => { throw Error(); } }, true);
  await failed.enable();
  assert.ok(JSON.stringify(failed.nodes()).includes('DELIVERY_FAILED'));
  assert.ok(!JSON.stringify(failed.nodes()).includes('수신함 저장 확인'));
});
test('test emergency button has no actionable telephone callback', () => {
  let calls = 0;
  const hooks = { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {} };
  const context = { exports: {}, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return { View: 'View', Text: 'Text', Linking: { openURL: () => { calls++; } } };
    if (name.endsWith('/emergencyCall')) return { requestEmergencyDialer: () => { calls++; } };
    if (name === './ui') return { Action: 'Action', s: {} };
    throw Error('Unexpected dependency');
  } };
  vm.runInNewContext(compile('src/components/EmergencyCallButton.tsx'), context);
  const tree = context.exports.EmergencyCallButton({ testOnly: true });
  const button = tree.props.children[0];
  assert.equal(button.props.disabled, true); button.props.onPress(); assert.equal(calls, 0);
});
