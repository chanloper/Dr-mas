// Deterministic state/effect harness; no native renderer, sockets or real data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = relative => ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const controller = compile('features/app/useDrMASController.ts');
const service = compile('services/localMedications.ts');

function createHarness({ auth, storage, alerts = [], DateImpl = Date }) {
  const local = { exports: {}, require: () => ({ __esModule: true, default: storage }) };
  vm.runInNewContext(service, local);
  function mount() {
    const slots = [], effects = [], timers = new Map(), appState = new Set();
    let cursor = 0, dirty = true, current, disposed = false, lateUpdates = 0;
    const hooks = {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => {
          if (disposed) { lateUpdates++; return; }
          const next = typeof value === 'function' ? value(slots[index]) : value;
          if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
        }];
      },
      useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useCallback(callback, deps) {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { deps, callback };
        return slots[index].callback;
      },
      useEffect(effect, deps) {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
          effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
        }
      },
    };
    const sandbox = {
      exports: {}, Date: DateImpl,
      require: name => {
        if (name === 'react') return hooks;
        if (name === 'react-native') return { Alert: { alert: (...args) => alerts.push(args) }, AppState: {
          addEventListener: (_, callback) => { appState.add(callback); return { remove: () => appState.delete(callback) }; },
        } };
        if (name === '../../services/localMedications') return local.exports;
        if (name === '../../services/auth') return auth;
        throw Error(`unexpected import: ${name}`);
      },
      setTimeout: callback => { const id = {}; timers.set(id, callback); return id; },
      clearTimeout: id => timers.delete(id),
    };
    vm.runInNewContext(controller, sandbox);
    function render() {
      if (disposed) return;
      let count = 0;
      while (dirty) {
        assert.ok(count++ < 40, 'state render loop'); dirty = false; cursor = 0;
        current = sandbox.exports.useDrMASController();
        while (effects.length) effects.shift()();
      }
    }
    async function flush() {
      for (let i = 0; i < 6; i++) { render(); await new Promise(resolve => setImmediate(resolve)); }
      render();
    }
    render();
    return {
      get state() { render(); return current; }, flush,
      get lateUpdates() { return lateUpdates; },
      timers: () => [...timers.values()],
      activate() { appState.forEach(callback => callback('active')); },
      async tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); await flush(); },
      dispose() { disposed = true; for (const slot of slots) slot?.cleanup?.(); timers.clear(); },
    };
  }
  return { mount, service: local.exports };
}
module.exports = { createHarness };
