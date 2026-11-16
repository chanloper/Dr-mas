/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(file, exportName, service, props = {}) {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, dirty = true, tree;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { const n = typeof v === 'function' ? v(slots[i]) : v; if (!Object.is(n, slots[i])) { slots[i] = n; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const jsx = (type, p) => ({ type: typeof type === 'function' ? type.name : type, props: p });
  const box = { exports: {}, AbortController, Date, JSON,
    setTimeout: (fn, ms) => { const id = {}; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'react-native' ? { Linking: {}, Switch: 'Switch', Pressable: 'Pressable', Text: 'Text', View: 'View' } : name.endsWith('/prescriptionAnalysis') ? service : name.endsWith('/durContract') ? { DUR_SOURCE_URL: 'https://www.data.go.kr/data/15059486/openapi.do' } : name === './DurMedicineSearch' ? { DurMedicineSearch: 'DurMedicineSearch' } : name === './FeatureModal' ? { FeatureModal: 'FeatureModal' } : { Action: 'Action', Field: 'Field', Chip: 'Chip', Panel: 'Panel', StatusMessage: 'StatusMessage', TitleRow: 'TitleRow', s: {} },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, box);
  function render() { let n = 0; while (dirty) { assert.ok(n++ < 30); dirty = false; cursor = 0; tree = box.exports[exportName](props); while (effects.length) effects.shift()(); } }
  function nodes(value, out = []) { if (!value) return out; if (Array.isArray(value)) { value.forEach(v => nodes(v, out)); return out; } if (typeof value === 'object') { out.push(value); nodes(value.props?.children, out); nodes(value.props?.selectedList, out); } return out; }
  render();
  return { find(type) { render(); return nodes(tree).find(n => n.type === type); }, nodes() { render(); return nodes(tree); }, async flush() { for (let i = 0; i < 4; i++) { render(); await new Promise(setImmediate); } render(); }, async tick() { render(); const tasks = [...timers.values()]; timers.clear(); for (const t of tasks) { assert.equal(t.ms, 700); await t.fn(); } render(); }, unmount() { slots.forEach(s => s?.cleanup?.()); } };
}

test('automatic search waits for consent and debounce; Enter does not double-request; selection clears query', async () => {
  const calls = [];
  const candidate = { name: '시험품목', itemSeq: '999000001', manufacturer: null, ingredient: null };
  const chosen = [];
  const h = mount('DurMedicineSearch.tsx', 'DurMedicineSearch', { durConfigured: () => true, searchPrescriptionDrugs: async (q, p, signal) => { calls.push({ q, signal }); return { query: q, page: p, candidates: [candidate], checkedAt: new Date().toISOString() }; } }, { selected: [], automatic: true, onSelect: c => chosen.push(c) });
  h.find('Field').props.onChangeText('시험'); await h.tick(); assert.equal(calls.length, 0);
  h.find('Switch').props.onValueChange(true); await h.flush();
  assert.equal(calls.length, 0);
  h.find('Field').props.onSubmitEditing(); await h.flush(); await h.tick(); assert.equal(calls.length, 1);
  h.find('Pressable').props.onPress(); await h.flush(); assert.equal(chosen.length, 1); assert.equal(h.find('Field').props.value, '');
  h.find('Field').props.onChangeText('다음'); await h.flush(); h.find('Switch').props.onValueChange(false); await h.tick(); assert.equal(calls.length, 1);
  h.unmount();
});

test('automatic pair lookup needs separate consent; stale responses and withdrawal cannot update results; combination cache avoids repeats', async () => {
  const calls = [], deferred = [];
  const h = mount('PublicMedicineInfo.tsx', 'DurPanel', { checkPrescriptionDur: (drugs, signal) => { calls.push({ drugs, signal }); return new Promise(resolve => deferred.push(resolve)); } });
  const a = { name: '합성가', itemSeq: '999000001' }, b = { name: '합성나', itemSeq: '999000002' }, c = { name: '합성다', itemSeq: '999000003' };
  h.find('DurMedicineSearch').props.onSelect(a); await h.flush(); h.find('DurMedicineSearch').props.onSelect(b); await h.flush(); await h.tick(); assert.equal(calls.length, 0);
  h.find('Switch').props.onValueChange(true); await h.flush();
  // Start timer without awaiting the deliberately deferred network request.
  const pending = h.tick(); await h.flush(); assert.equal(calls.length, 1);
  h.find('DurMedicineSearch').props.onSelect(c); await h.flush(); assert.equal(calls[0].signal.aborted, true);
  deferred[0]({ drugs: [], warnings: [{ first: 'STALE', second: 'STALE', content: 'STALE' }] }); await pending; await h.flush();
  assert.equal(h.nodes().some(n => n.props?.children === 'STALE'), false);
  const pending2 = h.tick(); await h.flush(); assert.equal(calls.length, 2);
  deferred[1]({ drugs: [a, b, c].map(d => ({ ...d, identityConfirmed: true, truncated: false })), warnings: [{ first: a.name, second: b.name, content: '시험 원문' }, { first: b.name, second: a.name, content: '시험 원문' }], notices: [{ name: a.name, counterpart: '기타', content: '기타 원문' }] }); await pending2; await h.flush();
  assert.equal(h.nodes().filter(n => n.type === 'StatusMessage' && n.props.kind === 'error').length, 1);
  assert.equal(h.nodes().some(n => n.props?.children === '기타 원문'), false);
  h.nodes().find(n => n.type === 'Pressable' && n.props.accessibilityLabel === `${c.name} 제거`).props.onPress(); await h.flush();
  h.find('DurMedicineSearch').props.onSelect(c); await h.flush(); await h.tick(); assert.equal(calls.length, 2);
  h.find('Switch').props.onValueChange(false); await h.flush(); await h.tick(); assert.equal(calls.length, 2);
  h.unmount();
});
