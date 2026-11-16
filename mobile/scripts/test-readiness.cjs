const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, mocks = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    fileName: relative,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, Date, Intl, require: name => { if (Object.hasOwn(mocks, name)) return mocks[name]; if(name==='../services/consultationFlow')return load('src/services/consultationFlow.ts'); throw Error(`unexpected import: ${name}`); }, ...globals };
  vm.runInNewContext(source, context); return context.exports;
}
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002', ID = '10000000-0000-4000-8000-000000000001';
const row = { id: ID, patient_id: A, title: '가상 일정', detail: '', time_local: '08:00:00', timezone: 'Asia/Seoul', active: true };
const input = { title: '가상 일정', detail: '', time_local: '08:00' };
function dashboardFixture(links, medications) {
  const jsx = (type, props) => ({ type, props });
  const components = load('src/components/DashboardSummaries.tsx', {
    '../services/careNames': { careNameLabel: row => row.display_name?.trim() || (row.display_name === undefined ? '이름 확인 불가' : '이름 미등록') },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Text:'Text', View:'View' },
    '../features/care/useCareLinks': { useCareLinks: () => links },
    '../features/medications/useCloudMedications': { useCloudMedications: () => medications },
    './ui': { Action:'Action', Chip:'Chip', Panel:'Panel', StatusMessage:'StatusMessage', TitleRow:'TitleRow', C:{ green:'#047857' }, s:{} },
  });
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  return { components, nodes };
}
test('guardian home summary shows approved links only and keeps existing navigation callbacks', () => {
  let managed = 0, medication = 0;
  const f = dashboardFixture({ ready:true, busy:false, error:null, hasMore:false, rows:[{ id:'approved', patient_id:A, status:'approved' }, { id:'pending', patient_id:B, status:'pending' }], refresh() {} });
  const tree = f.components.ConnectedFamilySummary({ guardianId:A, onManage:()=>managed++, onMedication:()=>medication++ });
  const nodes = f.nodes(tree);
  assert.equal(nodes.filter(n => n.type === 'Chip' && n.props.text === '승인됨').length, 1);
  nodes.find(n=>n.type==='Action' && n.props.label==='가족 연결 관리').props.onPress();
  nodes.find(n=>n.type==='Action' && n.props.label==='가족 복약 조회').props.onPress();
  assert.equal(managed, 1); assert.equal(medication, 1);
});
test('unverified guardian summary hides stale links and keeps loading/error states', () => {
  const f = dashboardFixture({ ready:false, busy:true, error:'합성 연결 오류', rows:[{ id:'stale', patient_id:A, status:'approved' }], refresh() {} });
  const nodes = f.nodes(f.components.ConnectedFamilySummary({ guardianId:A, onManage() {}, onMedication() {} }));
  assert.equal(nodes.filter(n=>n.type==='Chip').length, 0);
  assert.equal(nodes.find(n=>n.type==='Action' && n.props.label==='가족 복약 조회').props.disabled, true);
  assert.ok(nodes.some(n=>n.type==='StatusMessage' && n.props.kind==='loading'));
  assert.ok(nodes.some(n=>n.type==='StatusMessage' && n.props.kind==='error'));
});

test('patient connection summary shows verified counts without identifiers and retains navigation',()=>{
 let managed=0;const links={ready:true,busy:false,error:null,rows:[{id:'approved',status:'approved'},{id:'pending',status:'pending'}]};
 const f=dashboardFixture(links,{});let all=f.nodes(f.components.PatientConnectionsSummary({patientId:A,onManage:()=>managed++}));
 const text=all.filter(n=>n.type==='Text').map(n=>JSON.stringify(n.props.children)).join(' ');
 assert.ok(text.includes('승인 연결 1건'));assert.ok(text.includes('승인 대기 1건'));assert.ok(!text.includes(A));
 all.find(n=>n.props?.label==='가족 연결 관리').props.onPress();assert.equal(managed,1);
 links.ready=false;links.busy=true;all=f.nodes(f.components.PatientConnectionsSummary({patientId:A,onManage(){}}));
 assert.ok(all.some(n=>n.props?.kind==='loading'));assert.ok(!all.some(n=>(JSON.stringify(n.props?.children)??'').includes('승인 연결 1건')));
});
test('patient home progress uses verified active schedules and their real records only', () => {
  const medications = { ready:true, busy:false, error:null, day:'2026-11-07', schedules:[row, { ...row, id:'archived', active:false }], records:[{ medication_id:row.id, taken:true }, { medication_id:'archived', taken:true }], refresh() {} };
  const f = dashboardFixture({}, medications);
  const nodes = f.nodes(f.components.PatientMedicationSummary({ user:{ id:A, role:'patient' }, onOpen() {} }));
  const progress = nodes.find(n=>n.props.accessibilityRole==='progressbar'); assert.equal(progress.props.accessibilityValue.max, 1); assert.equal(progress.props.accessibilityValue.now, 1);
  medications.ready = false;
  const stale = f.nodes(f.components.PatientMedicationSummary({ user:{ id:A, role:'patient' }, onOpen() {} }));
  assert.equal(stale.some(n=>n.props.accessibilityRole==='progressbar'), false);
});
test('compact modal keeps scrollable content and a reachable close action; busy modal blocks hardware close', () => {
  const jsx = (type, props) => ({ type, props }); let closed = 0;
  const mocks = { 'react/jsx-runtime': { jsx, jsxs:jsx },
    'react-native': { Modal:'Modal', KeyboardAvoidingView:'KeyboardAvoidingView', ScrollView:'ScrollView', Text:'Text', View:'View', Platform:{ OS:'android' }, useWindowDimensions:()=>({ width:320, height:420 }) },
    'react-native-safe-area-context':{ useSafeAreaInsets:()=>({ top:24, bottom:20, left:0, right:0 }) },
    './ui':{ Action:'Action', C:{ white:'#fff', line:'#eee' }, s:{} },
  };
  const { FeatureModal } = load('src/components/FeatureModal.tsx', mocks);
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value,...nodes(value.props?.children)] : [];
  const modal = FeatureModal({ visible:true, title:'긴 화면 제목', onClose:()=>closed++, children:'긴 내용'.repeat(200) });
  const all = nodes(modal), scroll = all.find(n=>n.type==='ScrollView');
  assert.equal(scroll.props.style.flexShrink, 1); assert.equal(scroll.props.style.minHeight, 0); assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  all.find(n=>n.type==='Action').props.onPress(); modal.props.onRequestClose(); assert.equal(closed, 2);
  const busy = FeatureModal({ visible:true, title:'처리 중', onClose:()=>closed++, closeDisabled:true, children:'합성 내용' });
  busy.props.onRequestClose(); assert.equal(closed, 2); assert.equal(nodes(busy).find(n=>n.type==='Action').props.disabled, true);
});
test('AI composer stacks on compact and large-font screens without changing input/send behavior', () => {
  const jsx = (type, props) => ({ type, props }); let width = 360, fontScale = 1, sent = 0, input = '';
  const model = { messages:[], chatInput:'합성 질문', setChatInput:v=>{input=v;}, sendChat:async()=>{sent++;}, chatLoading:false, cancelChat() {} };
  const { default: AiScreen } = load('src/screens/AiScreen.tsx', {
    react:{ useEffect(){}, useState:initial=>[initial,()=>{}], useRef:initial=>({current:initial}) }, 'react/jsx-runtime':{ jsx, jsxs:jsx },
    'react-native':{ Keyboard:{dismiss(){}}, Text:'Text', TextInput:'TextInput', View:'View', ScrollView:'ScrollView', useWindowDimensions:()=>({ width,fontScale }) },
    '../features/app/context':{ useDrMAS:()=>model }, '../components/ui':{ Action:'Action', Panel:'Panel', StatusMessage:'StatusMessage', C:{}, s:{} },
    '../components/ChatMessage':{ ChatMessage:'ChatMessage' }, '../components/EvidenceDetailsModal':{ EvidenceDetailsModal:'EvidenceDetailsModal' }, '../components/FeatureModal':{ FeatureModal:'FeatureModal' }, '../services/rag':{ ragConfigured:()=>true },
    'expo-router':{ useRouter:()=>({push() {}}) },
    '../components/EmergencyCallButton':{ EmergencyCallButton:'EmergencyCallButton' },
    '../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'}, '../components/HiraReferencePanel':{ HiraReferencePanel:'HiraReferencePanel' },
  });
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value,...nodes(value.props?.children)] : [];
  let all = nodes(AiScreen());
  assert.ok(all.some(n=>n.type==='View' && n.props.style?.flexDirection==='row'));
  all.find(n=>n.type==='TextInput').props.onChangeText('다른 합성 질문'); assert.equal(input, '다른 합성 질문');
  all.find(n=>n.type==='Action' && n.props.label==='보내기').props.onPress(); assert.equal(sent, 1);
  width=800; fontScale=1.5; all=nodes(AiScreen()); assert.ok(all.some(n=>n.type==='View' && n.props.style?.flexDirection==='row'));
  fontScale=1; all=nodes(AiScreen()); assert.ok(all.some(n=>n.type==='View' && n.props.style?.flexDirection==='row'));
  model.chatInput=''; all=nodes(AiScreen()); assert.equal(all.find(n=>n.type==='Action' && n.props.label==='보내기').props.disabled, true);
});
function repositoryFixture() {
  const requests = []; let actor = A, result = { data: row, error: null };
  const client = { auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) }, from(table) {
    const request = { table, filters: [] }; requests.push(request);
    const chain = {
      select(value) { request.select = value; return chain; }, order() { return chain; },
      eq(key, value) { request.filters.push([key, value]); return chain; },
      insert(value) { request.operation = 'insert'; request.payload = value; return chain; },
      update(value) { request.operation = 'update'; request.payload = value; return chain; },
      delete() { request.operation = 'delete'; return chain; },
      upsert(value, options) { request.operation = 'upsert'; request.payload = value; request.options = options; return chain; },
      single: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    }; return chain;
  } };
  const module = load('src/services/medicationRepository.ts');
  return { ...module, repo: module.createMedicationRepository(client), requests, setActor(value) { actor = value; }, setResult(value) { result = value; } };
}
test('web sessions survive adapter recreation but never touch server memory or other storage keys', async () => {
  const module = load('src/services/secureSessionStorage.web.ts'); const data = new Map([['unrelated', 'keep']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  await module.createBrowserSessionStorage(() => storage).setItem('session', 'fictional-session');
  const next = module.createBrowserSessionStorage(() => storage); assert.equal(await next.getItem('session'), 'fictional-session');
  await next.removeItem('session'); assert.equal(data.get('unrelated'), 'keep');
  const ssr = module.createBrowserSessionStorage(() => null); assert.equal(await ssr.getItem('session'), null);
  await assert.rejects(ssr.setItem('session', 'fictional-session')); assert.equal(await module.secureSessionStorage.getItem('session'), null);
});
test('blocked browser storage yields safe errors without token values', async () => {
  const m = load('src/services/secureSessionStorage.web.ts');
  const storage = m.createBrowserSessionStorage(() => { throw Error('fixture-token-must-not-escape'); });
  for (const task of [() => storage.getItem('session'), () => storage.setItem('session', 'fictional'), () => storage.removeItem('session')]) await assert.rejects(task(), e => e instanceof m.SessionStorageError && !e.message.includes('fixture-token'));
});
test('environment guard rejects mismatched Dev project and preserves default SSR with optional static output', () => {
  const module = load('app.config.ts', {}, { process: { env: { DRMAS_WEB_OUTPUT: 'static', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'dev-ref' } } });
  assert.equal(module.default({ config: { web: { output: 'server' }, extra: {} } }).web.output, 'static');
  const normal = load('app.config.ts', {}, { process: { env: {} } }); assert.equal(normal.default({ config: { web: { output: 'server' } } }).web.output, 'server');
  assert.equal(module.default({ config: {} }).extra.environment.expectedSupabaseRef, 'dev-ref');
  const client = load('src/services/supabase.ts', {
    'react-native-url-polyfill/auto': {}, 'expo-constants': { __esModule: true, default: { expoConfig: { extra: {} } } },
    '@supabase/supabase-js': { createClient: () => { throw Error('must not construct mismatched client'); } }, './secureSessionStorage': {}, './authDiagnostics': { logAuthDiagnostic() {} },
  }, { URL, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://other-ref.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_EXPECTED_SUPABASE_REF: 'dev-ref' } } });
  assert.throws(() => client.getSupabaseClient(), e => e instanceof client.SupabaseConfigError);
});
test('private credentials in public Auth configuration fail before manifest serialization', () => {
  for (const env of [{ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture_not_real' }, { EXPO_PUBLIC_SUPABASE_URL: 'https://user:fixture@host.invalid' }, { EXPO_PUBLIC_KAKAO_REST_API_KEY: 'fixture-only' }]) {
    const config = load('app.config.ts', {}, { URL, process: { env } });
    assert.throws(() => config.default({ config: {} }));
  }
});
test('schedule creation uses verified JWT actor and fixed owner; payload cannot grant owner or role', async () => {
  const f = repositoryFixture(); assert.equal((await f.repo.create(A, input)).id, ID);
  assert.equal(f.requests[0].payload.patient_id, A); assert.equal(f.requests[0].payload.timezone, 'Asia/Seoul');
  await assert.rejects(f.repo.create(A, { ...input, patient_id: B })); assert.equal(f.requests.length, 1);
  f.setActor(B); await assert.rejects(f.repo.create(A, input), e => e.code === 'AUTH'); assert.equal(f.requests.length, 1);
});
test('schedule update and archive preserve ownership, timezone and prior records; no delete is issued', async () => {
  const f = repositoryFixture(); await f.repo.update(A, ID, input); await f.repo.archive(A, ID, false);
  assert.ok(f.requests.every(r => r.table === 'medications' && r.operation === 'update'));
  assert.deepEqual(f.requests[0].filters, [['id', ID], ['patient_id', A]]);
  assert.equal('timezone' in f.requests[0].payload, false); assert.equal(f.requests[1].payload.active, false);
});
test('day records upsert checked and unchecked values under the same owner/day, never deleting history', async () => {
  const f = repositoryFixture(); f.setResult({ data: { medication_id: ID, patient_id: A, day: '2026-11-01', taken: false, taken_at: null }, error: null });
  await f.repo.mark(A, ID, '2026-11-01', false);
  assert.equal(f.requests[0].operation, 'upsert'); assert.equal(f.requests[0].payload.taken_at, null);
  assert.equal(f.requests[0].options.onConflict, 'medication_id,day');
  await assert.rejects(f.repo.mark(A, ID, '2026-02-30', true)); assert.equal(f.requests.length, 1);
});
test('server reads reject other-owner rows and server error details are never exposed', async () => {
  const f = repositoryFixture(); f.setResult({ data: [{ ...row, patient_id: B }], error: null });
  await assert.rejects(f.repo.list(A), e => e.code === 'RESPONSE');
  f.setResult({ data: null, error: { message: 'private payload must not escape' } });
  await assert.rejects(f.repo.list(A), e => e.code === 'SERVER' && !e.message.includes('private'));
});
test('cloud layer has no local import, RLS bypass, or automatic retry path; public search remains disabled', () => {
  const repo = fs.readFileSync(path.join(__dirname, '../src/services/medicationRepository.ts'), 'utf8');
  assert.equal(/AsyncStorage|service_role|sb_secret_/.test(repo), false);
  assert.match(fs.readFileSync(path.join(__dirname, '../../supabase/functions/search-places/.env.example'), 'utf8'), /SEARCH_PUBLIC_ENABLED=false/);
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8')); assert.equal(vercel.buildCommand, 'npm run build:web');
});

test('schedule deletion deactivates the verified owner row without deleting historical records', async () => {
  const f = repositoryFixture(); f.setResult({ data: { ...row, active: false }, error: null });
  await f.repo.remove(A, ID);
  assert.equal(f.requests[0].operation, 'update');
  assert.equal(f.requests[0].payload.active, false);
  assert.deepEqual(f.requests[0].filters, [['id', ID], ['patient_id', A]]);
  f.setResult({ data: null, error: { code: '42501', message: 'private detail' } });
  await assert.rejects(f.repo.remove(A, ID), e => e.code === 'SERVER' && !e.message.includes('private'));
  assert.ok(f.requests.every(request => request.table === 'medications'));
  f.setActor(B); const count = f.requests.length;
  await assert.rejects(f.repo.remove(A, ID), e => e.code === 'AUTH'); assert.equal(f.requests.length, count);
});

test('removing a completed schedule hides it from active lists immediately and after reload while preserving history', async () => {
  let saved = { ...row }; const record = { medication_id: ID, patient_id: A, day: '2026-11-08', taken: true, taken_at: '2026-11-08T00:00:00Z' };
  const repository = { list: async () => [saved], records: async () => [record], remove: async () => { saved = { ...saved, active: false }; return saved; } };
  const app = mountCloud(repository); await app.flush();
  assert.equal(app.state.records.length, 1); assert.equal(await app.state.mutate('remove', ID, false), true); await app.flush();
  assert.equal(app.state.schedules.filter(row => row.active).length, 0); assert.equal(app.state.records[0].taken, true);
  assert.equal(app.state.schedules[0].id, app.state.records[0].medication_id);
  app.dispose(); const reopened = mountCloud(repository); await reopened.flush();
  assert.equal(reopened.state.schedules.filter(row => row.active).length, 0); assert.equal(reopened.state.records[0].taken, true); reopened.dispose();
});

test('completed schedule deletion requires explicit confirmation, shows prescription warning, and cancel does not write', async () => {
  let cursor=0;const slots=[],writes=[];
  const cloud={day:'2026-11-08',busy:false,ready:true,schedules:[row],records:[{medication_id:ID,taken:true}],mutate:async(...args)=>{writes.push(args);return true;}};
  const hooks={useEffect(){},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
  const module=load('src/components/CloudMedicationPanel.tsx',{
    react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{Text:'Text',View:'View',AppState:{}},'./ui':{Action:'Action',Field:'Field',Panel:'Panel',StatusMessage:'StatusMessage',C:{},s:{}},
    '../services/careNames':{careNameLabel:()=>''},'../features/app/context':{useDrMAS:()=>({user:{id:A,role:'patient'}})},
    '../features/medications/useCloudMedications':{useCloudMedications:()=>cloud},'../features/care/useCareLinks':{},'../services/supabase':{},'../services/medicationRepository':{},
  });
  const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v.props?.children)]:[];
  const render=()=>{cursor=0;const panel=module.CloudMedicationPanel();return nodes(panel.type(panel.props));};
  let all=render();all.find(n=>n.props?.label==='삭제').props.onPress();all=render();assert.equal(writes.length,0);
  assert.ok(all.some(n=>n.props?.children==='이 복약 일정을 삭제하시겠어요? 처방받은 약은 임의로 중단하지 말고 의사나 약사와 상담하세요.'));
  all.find(n=>n.props?.label==='취소').props.onPress();all=render();assert.equal(all.some(n=>n.props?.label==='삭제 확인'),false);assert.equal(writes.length,0);
  all.find(n=>n.props?.label==='삭제').props.onPress();all=render();all.find(n=>n.props?.label==='삭제 확인').props.onPress();
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[['remove',ID,false]]);
});

function mountCloud(repository) {
  const slots = [], effects = []; let cursor = 0, dirty = true, current, disposed = false, late = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { if (disposed) { late++; return; } const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const module = load('src/features/medications/useCloudMedications.ts', {
    react: hooks, '../../services/supabase': { getSupabaseClient: () => ({}) },
    '../../services/medicationRepository': { ...repositoryFixture(), createMedicationRepository: () => repository },
  });
  function render() { let count = 0; while (dirty && !disposed) { assert.ok(count++ < 30); dirty = false; cursor = 0; current = module.useCloudMedications({ id: A, role: 'patient' }); while (effects.length) effects.shift()(); } }
  render();
  return { get state() { render(); return current; }, get late() { return late; },
    async flush() { for (let i = 0; i < 5; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } render(); },
    dispose() { disposed = true; for (const s of slots) s?.cleanup?.(); },
  };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('cloud day reapply is a no-op and uncertain writes require reread without an automatic duplicate', async () => {
  let creates = 0; const repository = { list: async () => [], records: async () => [], create: async () => { creates++; throw Error('fixture uncertain response'); } };
  const app = mountCloud(repository); await app.flush(); assert.equal(app.state.ready, true);
  app.state.changeDay(app.state.day); assert.equal(app.state.ready, true);
  assert.equal(await app.state.mutate('create', '', input), false); await app.flush();
  assert.equal(app.state.ready, false); await app.state.mutate('create', '', input); assert.equal(creates, 1);
  app.state.refresh(); await app.flush(); assert.equal(app.state.ready, true); assert.equal(creates, 1); app.dispose();
});
test('cloud unmount during a load or mutation prevents previous-user state completion', async () => {
  const read = deferred(); const first = mountCloud({ list: () => read.promise, records: async () => [] });
  await first.flush(); first.dispose(); read.resolve([row]); await first.flush(); assert.equal(first.late, 0);
  const write = deferred(); const second = mountCloud({ list: async () => [row], records: async () => [], update: () => write.promise });
  await second.flush(); const saving = second.state.mutate('update', ID, input); second.dispose(); write.resolve(row);
  assert.equal(await saving, false); assert.equal(second.late, 0);
});
test('cloud load failure never exposes default schedules or enables mutations', async () => {
  let edits = 0; const app = mountCloud({ list: async () => { throw Error('fixture'); }, records: async () => [], create: async () => { edits++; return row; } });
  await app.flush(); assert.equal(app.state.ready, false); assert.equal(app.state.schedules.length, 0);
  await app.state.mutate('create', '', input); assert.equal(edits, 0); assert.ok(app.state.error); app.dispose();
});
