// Synthetic IDs and in-memory mocks only. No network or database.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const A='11111111-1111-4111-8111-111111111111',G='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333';
const patient={id:A,role:'patient'},guardian={id:G,role:'guardian'};
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const box={exports:{}};vm.runInNewContext(compile('src/services/sos.ts'),box);const api=box.exports;
const row=()=>({id:I,request_id:I,patient_id:A,guardian_id:G,created_at:'2026-11-04T00:00:00Z',acknowledged_at:null});
test('119 dialer only requests the tel handler explicitly; unsupported handlers return a safe status',async()=>{
 const sandbox={exports:{}};vm.runInNewContext(compile('src/services/emergencyCall.ts'),sandbox);
 const calls=[];assert.equal(calls.length,0);
 assert.equal(await sandbox.exports.requestEmergencyDialer(async url=>{calls.push(url);}), 'requested');
 assert.deepEqual(calls,['tel:119']);
 assert.equal(await sandbox.exports.requestEmergencyDialer(async()=>{throw Error('private platform error');}), 'unavailable');
 const source=fs.readFileSync('src/components/EmergencyCallButton.tsx','utf8');
 assert.match(source,/onPress=\{\(\) => \{ void openDialer\(\); \}\}/);
 assert.doesNotMatch(source,/setTimeout|setInterval|CALL_PHONE|ACTION_CALL/);
});
function fixture(actor=patient){
 let authId=actor.id,err=null,data=1,rows=[row()],reject=false,release;const calls=[],filters=[];
 const client={auth:{getUser:async()=>({data:{user:authId?{id:authId}:null},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(reject)throw Error('private upstream');if(release)return release;return {data,error:err};},from(name){assert.equal(name,'sos_alerts');const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},order:()=>q,limit:n=>{assert.equal(n,50);return Promise.resolve({data:rows,error:err});}};return q;}};
 return {repo:api.createSosRepository(client),calls,filters,setAuth:x=>authId=x,setError:x=>err=x,setData:x=>data=x,setRows:x=>rows=x,offline:()=>reject=true,pending:p=>release=p};
}
test('send and acknowledge use exact RPC contracts without supplied patient identity',async()=>{
 const f=fixture();assert.equal(await f.repo.send(patient),1);assert.equal(f.calls[0].name,'request_sos_alert');assert.equal(f.calls[0].args,undefined);
 f.setAuth(G);await f.repo.acknowledge(guardian,I);assert.equal(f.calls[1].name,'acknowledge_sos_alert');assert.equal(f.calls[1].args.alert_id,I);
});
test('expired and mismatched sessions stop before RPC',async()=>{
 const f=fixture();for(const id of [null,G]){f.setAuth(id);await assert.rejects(f.repo.send(patient),e=>e.code==='AUTH');}assert.equal(f.calls.length,0);
});
test('wrong roles and malformed identifiers stop before RPC',async()=>{
 const f=fixture();await assert.rejects(f.repo.acknowledge(patient,I),e=>e.code==='ROLE');f.setAuth(G);
 await assert.rejects(f.repo.send(guardian),e=>e.code==='ROLE');await assert.rejects(f.repo.acknowledge(guardian,'bad'),e=>e.code==='INPUT');assert.equal(f.calls.length,0);
});
test('duplicate taps serialize; uncertain network failures are never retried',async()=>{
 const f=fixture();let resolve;f.pending(new Promise(r=>resolve=r));const first=f.repo.send(patient);
 await assert.rejects(f.repo.send(patient),e=>e.code==='BUSY');await new Promise(r=>setImmediate(r));resolve({data:1,error:null});await first;assert.equal(f.calls.length,1);
 const offline=fixture();offline.offline();await assert.rejects(offline.repo.send(patient),e=>e.code==='NETWORK');assert.equal(offline.calls.length,1);
});
test('old Dev schema/RPC is unavailable and never reports success',async()=>{
 for(const code of ['42P01','PGRST202','PGRST205','42883']){const f=fixture();f.setError({code,message:'private secret'});await assert.rejects(f.repo.send(patient),e=>e.code==='UNAVAILABLE'&&!e.message.includes('private'));}
});
test('no guardian, rate limit and forbidden have distinct safe outcomes',async()=>{
 for(const [code,expected]of [['P0002','NO_GUARDIAN'],['P0001','RATE_LIMIT'],['42501','ROLE']]){const f=fixture();f.setError({code});await assert.rejects(f.repo.send(patient),e=>e.code===expected);}
 assert.ok(!api.sosErrorMessage(Error('private secret')).includes('private'));
});
test('reads scope verified participants and propagate acknowledgment on refresh',async()=>{
 const f=fixture(guardian);assert.equal((await f.repo.list(guardian))[0].acknowledged_at,null);assert.deepEqual(f.filters,[['guardian_id',G]]);
 f.setRows([{...row(),acknowledged_at:'2026-11-04T00:01:00Z'}]);assert.ok((await f.repo.list(guardian))[0].acknowledged_at);
 f.setAuth(A);await f.repo.list(patient);assert.deepEqual(f.filters[2],['patient_id',A]);
});
test('foreign, malformed and duplicate returned rows fail closed',async()=>{
 for(const rows of [[{...row(),guardian_id:A}],[{...row(),patient_id:G}],[row(),row()],[{...row(),acknowledged_at:'bad'}],[{...row(),acknowledged_at:'2025-01-01'}]]){const f=fixture(guardian);f.setRows(rows);await assert.rejects(f.repo.list(guardian),e=>e.code==='SERVER');}
});
test('invalid recipient count cannot produce success',async()=>{
 for(const v of [0,-1,'1',null,1.5]){const f=fixture();f.setData(v);await assert.rejects(f.repo.send(patient),e=>e.code==='SERVER');}
});
function mount(repo,actor=patient){
 let cursor=0,dirty=true,disposed=false,late=0,tree;const slots=[],effects=[],timers=new Map(),intervals=new Map();let timerId=0,listener;
 const hooks={useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{if(disposed){late++;return;}slots[i]=typeof v==='function'?v(slots[i]):v;dirty=true;}];},useRef(v){const i=cursor++;return slots[i]??={current:v};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>v!==old.deps[j]))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const context={exports:{},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++timerId,fn);return timerId;},clearInterval:id=>intervals.delete(id),require:name=>{
 if(name==='react')return hooks;if(name==='react/jsx-runtime')return require(name);
 if(name==='react-native')return {Text:'Text',View:'View',AppState:{currentState:'active',addEventListener:(_,fn)=>{listener=fn;return {remove(){listener=null;}};}}};
 if(name==='../services/sos')return {...api,createSosRepository:()=>repo};if(name==='../services/supabase')return {getSupabaseClient:()=>({})};if(name==='./EmergencyCallButton')return {EmergencyCallButton:'EmergencyCallButton'};if(name==='./ui')return {Action:'Action',Panel:'Panel',StatusMessage:'StatusMessage',C:{danger:'#DC2626'},s:{}};throw Error(name);
 }};vm.runInNewContext(compile('src/components/SosPanel.tsx'),context);
 function render(){let n=0;while(dirty&&!disposed){assert.ok(n++<30);dirty=false;cursor=0;tree=context.exports.SosPanel({actor,delay:10});while(effects.length)effects.shift()();}}
 function nodes(){render();const out=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){out.push(n);visit(n.props?.children);}}visit(tree);return out;}
 async function flush(){for(let i=0;i<5;i++){render();await new Promise(r=>setImmediate(r));}render();}
 render();return {nodes,flush,press(label){nodes().find(n=>n.props?.label===label).props.onPress();render();},tick(){const pending=[...timers];timers.clear();pending.forEach(([,fn])=>fn());render();},poll(){intervals.forEach(fn=>fn());},background(){listener('background');render();},dispose(){disposed=true;slots.forEach(s=>s?.cleanup?.());},get late(){return late;}};
}
test('countdown cancels and completed countdown sends once only',async()=>{
 let sent=0;const app=mount({list:async()=>[],send:async()=>{sent++;return 1;}});await app.flush();app.press('SOS 알림 시작');app.tick();app.press('SOS 요청 취소');for(let i=0;i<12;i++)app.tick();assert.equal(sent,0);
 app.press('SOS 알림 시작');for(let i=0;i<10;i++)app.tick();await app.flush();assert.equal(sent,1);for(let i=0;i<10;i++)app.tick();assert.equal(sent,1);app.dispose();
});
test('background cancels send and polling; unmount ignores delayed result',async()=>{
 let sent=0,reads=0,release;const app=mount({list:async()=>{reads++;return [];},send:async()=>{sent++;return 1;}});await app.flush();app.press('SOS 알림 시작');app.background();for(let i=0;i<12;i++)app.tick();app.poll();assert.equal(sent,0);assert.equal(reads,1);app.dispose();
 const delayed=mount({list:()=>new Promise(r=>release=r)});delayed.dispose();release([row()]);await delayed.flush();assert.equal(delayed.late,0);
});
test('guardian confirms receipt; failed refresh removes protected stale content',async()=>{
 let acknowledged=0,fail=false;const app=mount({list:async()=>{if(fail)throw Error('private');return [row()];},acknowledge:async()=>{acknowledged++;}},guardian);await app.flush();app.press('요청 확인 완료');await app.flush();assert.equal(acknowledged,1);
 fail=true;app.poll();await app.flush();assert.ok(!app.nodes().some(n=>n.props?.label==='요청 확인 완료'));app.dispose();
});
