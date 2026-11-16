// Synthetic UUIDs, RPC replies and React element props only. No network or DB.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',G='33333333-3333-4333-8333-333333333333',L='44444444-4444-4444-8444-444444444444';
const patient={id:A,role:'patient'},guardian={id:G,role:'guardian'};
const row=(status='pending')=>({id:L,patient_id:A,guardian_id:G,requested_by:G,status,approved_by:status==='approved'?A:null,approved_at:status==='approved'?'2026-11-03T00:00:00Z':null,revoked_at:status==='revoked'?'2026-11-03T01:00:00Z':null,created_at:'2026-11-03T00:00:00Z'});
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
test('home keys remain distinct and account-scoped; guardian manage button navigates',()=>{
 const tabs=[];let id=A;
 const box={exports:{},require:name=>{if(name.endsWith('/careNames'))return {careNameLabel:row=>row.status==='approved'&&row.display_name!==undefined?(row.display_name?.trim()||'이름 미등록'):'이름 확인 불가',withCareNames:async(_c,_a,rows)=>rows,readApprovedCareNames:async()=>[]};if(name.endsWith('/sosRealtime'))return {watchSos:()=>()=>{}};
  if(name==='../services/registeredHealthNews')return {loadRegisteredHealthNews:async()=>[]};if(name==='react/jsx-runtime')return require(name);
  if(name==='react')return {...React,useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect(){}};
  if(name==='react-native')return {Pressable:'Pressable',Text:'Text',View:'View',Animated:{View:'AnimatedView',Value:class{}}};
  if(name==='expo-router')return {useRouter:()=>({push:()=>{}})};
  if(name==='../features/app/context')return {useDrMAS:()=>({user:{id},meds:[],takenCount:0,setTab:t=>tabs.push(t)})};
  if(name==='../components/ui')return {Action:'Action',C:{},s:{},SummaryTile:'SummaryTile',TitleRow:'TitleRow'};
  if(name==='../components/DashboardSummaries')return {PatientMedicationSummary:'PatientMedicationSummary',ConnectedFamilySummary:'ConnectedFamilySummary'};
  if(name==='../components/SosPanel')return {SosPanel:'SosPanel'};
  if(name==='../components/HealthNewsCarousel')return {HealthNewsCarousel:'HealthNewsCarousel'};
  if(name==='../components/MedicationStatus')return {MedicationStatus:'MedicationStatus'};
  throw Error(name);
 }};
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
 vm.runInNewContext(compile('src/screens/PatientHome.tsx'),box);
 const keys=()=>nodes(box.exports.default()).filter(n=>['PatientMedicationSummary','SosPanel'].includes(n.type)).map(n=>n.key);
 const first=keys();assert.equal(new Set(first).size,2);assert.ok(first.every(k=>k.includes(A)));
 id=B;assert.ok(keys().every(k=>k.includes(B)&&!first.includes(k)));
 const guardianBox={exports:{},require:box.require};
 vm.runInNewContext(compile('src/screens/GuardianHome.tsx'),guardianBox);
 const button=nodes(guardianBox.exports.default()).find(n=>n.props?.label==='가족 연결 관리');button.props.onPress();assert.deepEqual(tabs,['settings']);
});
function service(){const s={exports:{}};vm.runInNewContext(compile('src/services/careLinks.ts'),s);return s.exports;}
test('family card opens management, hides identifiers, and separates loading/error/empty',()=>{
 const model={rows:[row('approved')],ready:true,busy:false,error:null};let opened=0;
 const box={exports:{},require:name=>{if(name.endsWith('/careNames'))return {careNameLabel:row=>row.status==='approved'&&row.display_name!==undefined?(row.display_name?.trim()||'이름 미등록'):'이름 확인 불가',withCareNames:async(_c,_a,rows)=>rows,readApprovedCareNames:async()=>[]};if(name.endsWith('/sosRealtime'))return {watchSos:()=>()=>{}};
  if(name==='react/jsx-runtime')return require(name);
  if(name==='react-native')return {Pressable:'Pressable',Text:'Text',View:'View'};
  if(name==='../features/care/useCareLinks')return {useCareLinks:()=>model};
  if(name==='../features/medications/useCloudMedications')return {};
  if(name==='./ui')return {Panel:'Panel',StatusMessage:'StatusMessage',Chip:'Chip',Action:'Action',s:{}};
  throw Error(name);
 }};vm.runInNewContext(compile('src/components/DashboardSummaries.tsx'),box);
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
 const render=()=>nodes(box.exports.ConnectedFamilySummary({guardianId:G,onManage:()=>opened++,onMedication:()=>{}}));
 let result=render();result.find(n=>n.type==='Pressable').props.onPress();assert.equal(opened,1);
 const text=result.filter(n=>n.type==='Text').map(n=>JSON.stringify(n.props.children)).join(' ');
 assert.ok(text.includes('이름 확인 불가'));assert.ok(!text.includes(A)&&!text.includes(G));
 assert.ok(result.some(n=>n.props?.text==='승인됨'));
 model.rows=[];assert.ok(render().some(n=>n.props?.kind==='empty'));
 model.ready=false;model.busy=true;assert.ok(render().some(n=>n.props?.kind==='loading'));assert.ok(!render().some(n=>n.props?.kind==='empty'));
 model.busy=false;model.error='연결 확인 실패';assert.ok(render().some(n=>n.props?.kind==='error'));
});
function fixture(actor=patient){
 const api=service(),calls=[],queries=[];let rows=[row()],authError=null,authId=actor.id,rpcError=null,rpcData=L,queryError=null,unfiltered=false,extended=false,serverCap=Infinity;
 const client={auth:{getUser:async()=>({data:{user:authId?{id:authId}:null},error:authError})},
  from(table){assert.equal(table,'care_links');const filters=[];const query={table,filters};queries.push(query);let cap=101,fields='',cursor=null;
   const result=()=>{
    let data=unfiltered?rows:rows.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));
    const micro=t=>BigInt(Date.parse(t))*1000n+BigInt((t.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(3));
    data=[...data].sort((a,b)=>micro(a.created_at)>micro(b.created_at)?-1:micro(a.created_at)<micro(b.created_at)?1:b.id.localeCompare(a.id));
    if(cursor)data=data.filter(r=>micro(r.created_at)<micro(cursor.time)||micro(r.created_at)===micro(cursor.time)&&r.id<cursor.id);
    return {data:data.slice(0,Math.min(cap,serverCap)),count:data.length,error:queryError??(!extended&&fields.includes('closure_reason')?{code:'42703'}:null)};
   };
   const q={select(value){fields=value;query.fields=value;assert.ok(!value.includes('email'));return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},or(value){query.or=value;const m=value.match(/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([0-9a-f-]+)\)$/);assert.ok(m);assert.equal(m[1],m[2]);cursor={time:m[1],id:m[3]};return q;},order(){return q;},limit(n){cap=n;query.limit=n;return q;},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]??null};},then(yes,no){return Promise.resolve(result()).then(yes,no);}};return q;},
  rpc:async(name,args)=>{calls.push({name,args});return {data:rpcData,error:rpcError};}};
 return {api,repo:api.createCareLinkRepository(client),calls,queries,setRows:v=>{rows=v;},setExtended:v=>{extended=v;},setServerCap:v=>{serverCap=v;},setAuth:(id,error=null)=>{authId=id;authError=error;},setRpc:(error,data=L)=>{rpcError=error;rpcData=data;},setQueryError:e=>{queryError=e;},unfilter:()=>{unfiltered=true;}};
}
test('guardian request uses exact RPC signature; patient, self and malformed ID are blocked',async()=>{
 const f=fixture(guardian);f.setRows([]);assert.equal(await f.repo.request(guardian,A),L);assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'request_care_link',args:{target_patient:A}}]);
 for(const [actor,target,code]of [[patient,B,'ROLE'],[guardian,G,'SELF'],[guardian,'not-a-uuid','INPUT']])await assert.rejects(f.repo.request(actor,target),e=>e.code===code);
 assert.equal(f.calls.length,1);
});
test('expired and mismatched sessions stop before any query or RPC',async()=>{
 const f=fixture(guardian);f.setAuth(B);await assert.rejects(f.repo.request(guardian,A),e=>e.code==='AUTH');
 f.setAuth(null,{status:401,message:'private upstream'});await assert.rejects(f.repo.list(guardian),e=>e.code==='AUTH');
 assert.equal(f.calls.length,0);assert.equal(f.queries.length,0);
});
test('duplicate/nonexistent-or-disallowed accounts and server errors have safe distinct messages',async()=>{
 const f=fixture(guardian);f.setRows([]);
 for(const [error,code]of [[{code:'23505'},'DUPLICATE'],[{code:'42501'},'TARGET'],[{code:'23503'},'TARGET'],[{status:401},'AUTH'],[{status:500,message:'private-token'},'SERVER']]){
  f.setRpc(error);await assert.rejects(f.repo.request(guardian,A),e=>e.code===code&&!e.message.includes('private-token'));
 }
 assert.ok(!f.api.careLinkErrorMessage(Error('private-token')).includes('private-token'));
});
test('patient approve, reject and revoke use verified own link and the exact existing void RPCs',async()=>{
 const f=fixture();f.setRpc(null,null);
 await f.repo.decide(patient,L,'approve');await f.repo.decide(patient,L,'reject');
 f.setRows([row('approved')]);await f.repo.decide(patient,L,'revoke');
 assert.deepEqual(f.calls.map(c=>c.name),['approve_care_link','revoke_care_link','revoke_care_link']);
 for(const c of f.calls)assert.deepEqual(JSON.parse(JSON.stringify(c.args)),{link_id:L});
 assert.ok(f.queries.every(q=>q.filters.some(([k,v])=>k==='patient_id'&&v===A)));
});
test('guardian cannot approve/reject, other patient cannot mutate, stale states cannot be replayed',async()=>{
 const f=fixture(guardian);await assert.rejects(f.repo.decide(guardian,L,'approve'),e=>e.code==='ROLE');await assert.rejects(f.repo.decide(guardian,L,'reject'),e=>e.code==='ROLE');
 f.setAuth(B);await assert.rejects(f.repo.decide({id:B,role:'patient'},L,'revoke'),e=>e.code==='STALE');
 f.setAuth(A);f.setRows([row('revoked')]);await assert.rejects(f.repo.decide(patient,L,'approve'),e=>e.code==='STALE');
 assert.equal(f.calls.length,0);
});
test('guardian can cancel own pending request; list filters participants and rejects cross-user responses',async()=>{
 const f=fixture(guardian);await f.repo.decide(guardian,L,'cancel');assert.equal(f.calls[0].name,'revoke_care_link');
 const list=await f.repo.list(guardian);assert.equal(list.length,1);assert.ok(f.queries.at(-1).filters.some(([k,v])=>k==='guardian_id'&&v===G));
 f.unfilter();f.setRows([{...row(),guardian_id:B,requested_by:B}]);await assert.rejects(f.repo.list(guardian),e=>e.code==='RESPONSE');
});
test('malformed RPC output, permission failure and duplicate row lists fail closed',async()=>{
 const f=fixture(guardian);f.setRows([]);f.setRpc(null,'invalid');await assert.rejects(f.repo.request(guardian,A),e=>e.code==='RESPONSE');
 f.setRows([row()]);
 f.setRpc({code:'42501'},null);await assert.rejects(f.repo.decide(guardian,L,'cancel'),e=>e.code==='STALE');
 f.setRows(Array.from({length:101},()=>row()));await assert.rejects(f.repo.list(guardian),e=>e.code==='RESPONSE');
});
test('local migration contract keeps pending guardians out of medication reads and grants no direct care-link writes',()=>{
 const sql=fs.readFileSync('../supabase/migrations/202611010001_auth_and_care.sql','utf8');
 assert.match(sql,/create function public\.request_care_link\(target_patient uuid\) returns uuid/);
 assert.match(sql,/create function public\.approve_care_link\(link_id uuid\) returns void/);
 assert.match(sql,/create function public\.revoke_care_link\(link_id uuid\) returns void/);
 const helper=sql.match(/create function drmas_private\.can_read_patient[\s\S]*?\$\$;/)[0];
 for(const value of ["current_role() = 'guardian'","c.status = 'approved'","c.guardian_id = (select auth.uid())","p.role = 'patient'"])assert.ok(helper.includes(value));
 assert.match(sql,/medications_read[\s\S]*?using \(drmas_private\.can_read_patient\(patient_id\)\)/);
 assert.match(sql,/records_read[\s\S]*?using \(drmas_private\.can_read_patient\(patient_id\)\)/);
 assert.doesNotMatch(sql,/grant (?:insert|update|delete)[^;]*on public\.care_links/);
 assert.doesNotMatch(fs.readFileSync('src/services/careLinks.ts','utf8'),/\.from\(['"](?:medications|medication_records|profiles)['"]\)|\.insert\(|\.update\(|\.delete\(/);
});
function panel(actor,links){
 let slots=[],cursor=0,calls=[];const model={rows:links,ready:true,busy:false,error:null,notice:null,supportsReconnect:false,hasMore:false,loadMore:async()=>{},refresh:async()=>{},perform:async(...args)=>{calls.push(args);return true;}};
 const sandbox={exports:{},require:name=>{if(name.endsWith('/careNames'))return {careNameLabel:row=>row.status==='approved'&&row.display_name!==undefined?(row.display_name?.trim()||'이름 미등록'):'이름 확인 불가',withCareNames:async(_c,_a,rows)=>rows,readApprovedCareNames:async()=>[]};if(name.endsWith('/sosRealtime'))return {watchSos:()=>()=>{}};
  if(name==='react/jsx-runtime')return require(name);
  if(name==='react')return {...React,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];}};
  if(name==='react-native')return {Text:'Text',TextInput:'TextInput',View:'View'};
  if(name==='../features/care/useCareLinks')return {useCareLinks:()=>model};
  if(name==='../services/careLinks')return service();
  if(name==='./ui')return {Action:'Action',Chip:'Chip',Panel:'Panel',TitleRow:'TitleRow',s:{}};
  throw Error('unexpected dependency');
 }};vm.runInNewContext(compile('src/components/CareLinksPanel.tsx'),sandbox);
 function render(){cursor=0;const nodes=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;nodes.push(n);walk(n.props?.children);}walk(sandbox.exports.CareLinksSession({actor}));return nodes;}
 return {render,calls,model};
}
test('role-specific UI asks confirmation before approve/reject/revoke; guardian request uses entered patient ID',async()=>{
 for(const [state,label,action]of [['pending','승인','approve'],['pending','거절','reject'],['approved','연결 해제','revoke']]){
  const ui=panel(patient,[row(state)]);ui.render().find(n=>n.props?.label===label).props.onPress();assert.equal(ui.calls.length,0);
  ui.render().find(n=>n.props?.label==='확인하고 처리').props.onPress();assert.deepEqual(ui.calls[0],[action,L]);
 }
 const ui=panel(guardian,[row()]);assert.ok(!ui.render().some(n=>n.props?.label==='승인'));
 ui.render().find(n=>n.type==='TextInput').props.onChangeText(A);
 ui.render().find(n=>n.props?.label==='연결 요청 보내기').props.onPress();assert.deepEqual(ui.calls[0],['request',A]);
});
test('connection UI disables actions when loading or in an unverified state',()=>{
 const ui=panel(patient,[row()]);ui.model.ready=false;
 assert.ok(!ui.render().some(n=>n.props?.label==='승인'));
 const other=panel(guardian,[]);other.model.busy=true;
 assert.equal(other.render().find(n=>n.props?.label==='연결 요청 보내기').props.disabled,true);
});

function mountHook(repo,initialActor=patient){
 let actor=initialActor,current,cursor=0,dirty=true,disposed=false,late=0;const slots=[],effects=[],listeners=new Set();
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{if(disposed){late++;return;}slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={fn,deps};return slots[i].fn;},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
 };
 const api=service();const box={exports:{},require:name=>{if(name.endsWith('/careNames'))return {careNameLabel:row=>row.status==='approved'&&row.display_name!==undefined?(row.display_name?.trim()||'이름 미등록'):'이름 확인 불가',withCareNames:async(_c,_a,rows)=>rows,readApprovedCareNames:async()=>[]};if(name.endsWith('/sosRealtime'))return {watchSos:()=>()=>{}};
  if(name==='react')return hooks;
  if(name==='react-native')return {AppState:{addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}}};
  if(name==='../../services/supabase')return {getSupabaseClient:()=>({})};
  if(name==='../../services/careLinks')return {...api,createCareLinkRepository:()=>({...repo,page:repo.page??(async actor=>({rows:await repo.list(actor),next:null,supportsReconnect:false}))})};
  throw Error('unexpected dependency');
 }};vm.runInNewContext(compile('src/features/care/useCareLinks.ts'),box);
 function render(){if(disposed)return;let count=0;while(dirty){assert.ok(count++<30);dirty=false;cursor=0;current=box.exports.useCareLinks(actor);while(effects.length)effects.shift()();}}
 async function flush(){for(let i=0;i<6;i++){render();await new Promise(r=>setImmediate(r));}render();}
 render();return {get state(){render();return current;},flush,switchActor(value){actor=value;dirty=true;render();},foreground(){listeners.forEach(fn=>fn('active'));},dispose(){disposed=true;for(const slot of slots)slot?.cleanup?.();},get lateUpdates(){return late;}};
}
test('connection hook prevents duplicate requests and ignores completion after unmount',async()=>{
 let resolve,calls=0;const app=mountHook({list:async()=>[],request:async()=>{calls++;return new Promise(r=>{resolve=r;});}},guardian);
 await app.flush();const first=app.state.perform('request',A);await app.state.perform('request',A);assert.equal(calls,1);
 app.dispose();resolve(L);await first;assert.equal(app.lateUpdates,0);
});
test('old account data cannot reappear after an account switch',async()=>{
 let release;const repo={list:actor=>actor.id===A?new Promise(r=>{release=r;}):Promise.resolve([{id:'synthetic-new-user-row'}])};
 const app=mountHook(repo);await app.flush();app.switchActor({id:B,role:'patient'});await app.flush();assert.equal(app.state.rows[0].id,'synthetic-new-user-row');
 release([{id:'synthetic-old-user-row'}]);await app.flush();assert.equal(app.state.rows[0].id,'synthetic-new-user-row');app.dispose();
});
test('uncertain mutation fails closed until explicit refresh and is never retried automatically',async()=>{
 let requests=0,reads=0;const app=mountHook({list:async()=>{reads++;return [row()];},request:async()=>{requests++;throw Error('private transport failure');}},guardian);
 await app.flush();await app.state.perform('request',A);await app.flush();assert.equal(app.state.ready,false);assert.equal(app.state.rows.length,0);assert.ok(!app.state.error.includes('private transport'));
 await app.state.perform('request',A);assert.equal(requests,1);assert.equal(reads,1);
 await app.state.refresh();await app.flush();assert.equal(app.state.ready,true);assert.equal(reads,2);app.dispose();
});
test('foreground refresh removes externally changed connection state',async()=>{
 let rows=[row('approved')];const app=mountHook({list:async()=>rows});await app.flush();assert.equal(app.state.rows.length,1);
 rows=[];app.foreground();await app.flush();assert.equal(app.state.rows.length,0);app.dispose();
});
test('an initial refresh queued before an account switch cannot read the old actor',async()=>{
 const reads=[];const app=mountHook({list:async actor=>{reads.push(actor.id);return [];}});
 app.switchActor({id:B,role:'patient'});await app.flush();assert.deepEqual(reads,[B]);app.dispose();
});
test('Services connection entry opens Settings while the existing places entry is unchanged',()=>{
 const tabs=[],routes=[],alerts=[];
 const box={exports:{},require:name=>{if(name.endsWith('/careNames'))return {careNameLabel:row=>row.status==='approved'&&row.display_name!==undefined?(row.display_name?.trim()||'이름 미등록'):'이름 확인 불가',withCareNames:async(_c,_a,rows)=>rows,readApprovedCareNames:async()=>[]};if(name.endsWith('/sosRealtime'))return {watchSos:()=>()=>{}};
  if(name==='react/jsx-runtime')return require(name);if(name==='react')return React;
  if(name==='expo-router')return {useRouter:()=>({push:path=>routes.push(path)})};
  if(name==='react-native')return {Alert:{alert:(...args)=>alerts.push(args)},Pressable:'Pressable',Text:'Text',View:'View'};
  if(name==='../components/ui')return {Chip:'Chip',C:{},s:{}};
  if(name==='../features/app/context')return {useDrMAS:()=>({setTab:tab=>tabs.push(tab)})};
  throw Error('unexpected dependency');
 }};vm.runInNewContext(compile('src/screens/ServicesScreen.tsx'),box);
 const nodes=[];function visit(n){if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;nodes.push(n);visit(n.props?.children);}visit(box.exports.default());
 nodes.find(n=>n.type==='Pressable'&&n.key==='보호자 연결').props.onPress();
 nodes.find(n=>n.type==='Pressable'&&n.key==='주변 병원 · 약국').props.onPress();
 assert.deepEqual(tabs,['settings']);assert.deepEqual(routes,['/places']);assert.equal(alerts.length,0);
});

const syntheticId = n => `55555555-5555-4555-8555-${String(n).padStart(12,'0')}`;
test('legacy schema falls back to base fields and blocks retry without an RPC',async()=>{
 const f=fixture(guardian);f.setRows([row('revoked')]);
 const page=await f.repo.page(guardian);assert.equal(page.supportsReconnect,false);assert.equal(page.rows[0].closure_reason,undefined);
 assert.ok(f.queries.some(q=>q.fields.includes('closure_reason')));
 await assert.rejects(f.repo.request(guardian,A),e=>e.code==='UNSUPPORTED');assert.equal(f.calls.length,0);
 f.setRows([]);assert.equal(await f.repo.request(guardian,B),L);
});
test('new schema reasons are validated, explicit null stays unknown, and malformed reasons fail closed',async()=>{
 const f=fixture(guardian);f.setExtended(true);
 for(const [reason,label]of [['rejected','거절됨'],['cancelled','요청 취소됨'],['revoked','해제됨'],[null,'종료됨 · 사유 미상']]){
  f.setRows([{...row('revoked'),closure_reason:reason}]);const p=await f.repo.page(guardian);assert.equal(p.supportsReconnect,true);assert.equal(f.api.careLinkStatus(p.rows[0]),label);
 }
 for(const bad of [{...row('revoked')},{...row('revoked'),closure_reason:'private-untrusted-text'},{...row(),closure_reason:'rejected'}]){
  f.setRows([bad]);await assert.rejects(f.repo.page(guardian),e=>e.code==='RESPONSE'&&!e.message.includes('private-untrusted'));
 }
});
test('retry creates a fresh request and reapproval uses its ID while old history is preserved',async()=>{
 const f=fixture(guardian);f.setExtended(true);const old={...row('revoked'),closure_reason:'rejected'};f.setRows([old]);
 const next=syntheticId(1);f.setRpc(null,next);assert.equal(await f.repo.request(guardian,A),next);
 f.setRows([old,{...row(),id:next,closure_reason:null,created_at:'2026-11-04T01:00:00Z'}]);
 await assert.rejects(f.repo.request(guardian,A),e=>e.code==='DUPLICATE');assert.equal(f.calls.length,1);
 f.setAuth(A);f.setRpc(null,null);await f.repo.decide(patient,next,'approve');
 assert.equal(f.calls[1].name,'approve_care_link');assert.equal(f.calls[1].args.link_id,next);
 await assert.rejects(f.repo.decide(patient,L,'approve'),e=>e.code==='STALE');assert.equal(old.status,'revoked');
});
test('active relationship on an unloaded page prevents retry even with schema support',async()=>{
 const f=fixture(guardian);f.setExtended(true);
 f.setRows([...Array.from({length:40},(_,i)=>({...row('revoked'),id:syntheticId(i),closure_reason:'cancelled',created_at:'2026-11-04T00:00:00Z'})),{...row('approved'),id:syntheticId(99),closure_reason:null}]);
 const first=await f.repo.page(guardian);assert.equal(first.rows.some(r=>r.status==='approved'),false);
 await assert.rejects(f.repo.request(guardian,A),e=>e.code==='DUPLICATE');assert.equal(f.calls.length,0);
});
test('keyset pages traverse 126 tied timestamps without truncation or duplicate IDs',async()=>{
 const f=fixture(guardian);const rows=Array.from({length:126},(_,i)=>({...row('revoked'),id:syntheticId(i)}));f.setRows(rows);
 let cursor=null,ids=[];do{const p=await f.repo.page(guardian,cursor);assert.ok(p.rows.length<=25);ids.push(...p.rows.map(r=>r.id));cursor=p.next;}while(cursor);
 assert.equal(ids.length,126);assert.equal(new Set(ids).size,126);
 assert.ok(f.queries.filter(q=>q.or).every(q=>q.filters.some(([k,v])=>k==='guardian_id'&&v===G)));
 await assert.rejects(f.repo.page(guardian,{createdAt:'2026-01-01),id.gt.0',id:L}),e=>e.code==='INPUT');
});
test('auth/network/schema-query failures never enable retry or fall back as old schema',async()=>{
 for(const [err,code]of [[{status:401,code:'PGRST301'},'AUTH'],[{name:'AbortError'},'NETWORK'],[{status:500,message:'private-detail'},'SERVER'],[{code:'42501'},'STALE']]){
  const f=fixture(guardian);f.setQueryError(err);await assert.rejects(f.repo.page(guardian),e=>e.code===code&&!e.message.includes('private-detail'));assert.equal(f.queries.length,1);assert.equal(f.calls.length,0);
 }
});
test('repository serializes concurrent mutation attempts before any duplicate RPC',async()=>{
 const f=fixture(guardian);f.setRows([]);const first=f.repo.request(guardian,A);
 await assert.rejects(f.repo.request(guardian,A),e=>e.code==='BUSY');await first;assert.equal(f.calls.length,1);
});
test('history UI separates reasons and hides retry until server schema support is confirmed',async()=>{
 const old={...row('revoked'),closure_reason:'rejected'};const ui=panel(guardian,[old]);
 assert.ok(!ui.render().some(n=>n.props?.label==='다시 연결 요청'));
 assert.ok(ui.render().some(n=>n.props?.text==='거절됨'));
 ui.model.supportsReconnect=true;ui.render().find(n=>n.props?.label==='다시 연결 요청').props.onPress();assert.equal(ui.calls.length,0);
 ui.render().find(n=>n.props?.label==='확인하고 처리').props.onPress();assert.deepEqual(ui.calls[0],['request',A]);
 ui.model.rows=[old,{...row('approved'),id:syntheticId(2),closure_reason:null}];
 assert.ok(!ui.render().some(n=>n.props?.label==='다시 연결 요청'));
 const p=panel(patient,[old]);p.model.supportsReconnect=true;assert.ok(!p.render().some(n=>n.props?.label==='다시 연결 요청'));
});
test('hook appends pages, locks duplicate loads and refreshes first page after mutations',async()=>{
 let reads=0,release;const repo={page:async(_actor,cursor)=>{reads++;if(cursor)return new Promise(r=>{release=r;});return {rows:[row()],next:{id:L,createdAt:row().created_at},supportsReconnect:true};},decide:async()=>{}};
 const app=mountHook(repo);await app.flush();const first=app.state.loadMore();await app.state.loadMore();assert.equal(reads,2);
 release({rows:[{...row('revoked'),id:syntheticId(3),closure_reason:'rejected'}],next:null,supportsReconnect:true});await first;await app.flush();assert.equal(app.state.rows.length,2);assert.equal(app.state.hasMore,false);
 await app.state.perform('approve',L);await app.flush();assert.equal(reads,3);assert.equal(app.state.rows.length,1);app.dispose();
});
test('expired pagination clears data/capability and late pages cannot cross account switches',async()=>{
 const api=service();let requests=0;const base={rows:[row()],next:{id:L,createdAt:row().created_at},supportsReconnect:true};
 const app=mountHook({page:async(_actor,cursor)=>{if(cursor)throw new api.CareLinkError('AUTH','로그인이 만료됐습니다.');return base;},request:async()=>{requests++;}},guardian);
 await app.flush();await app.state.loadMore();await app.flush();assert.equal(app.state.ready,false);assert.equal(app.state.supportsReconnect,false);assert.equal(app.state.rows.length,0);await app.state.perform('request',A);assert.equal(requests,0);app.dispose();
 let release;const other=mountHook({page:async(actor,cursor)=>cursor?new Promise(r=>{release=r;}):{...base,rows:actor.id===A?[row()]:[]}},patient);
 await other.flush();const pending=other.state.loadMore();other.switchActor({id:B,role:'patient'});await other.flush();release({...base,rows:[row()],next:null});await pending;await other.flush();assert.equal(other.state.rows.length,0);other.dispose();
});

test('server row caps cannot silently mark an incomplete list as complete',async()=>{
 const f=fixture(guardian);f.setRows(Array.from({length:40},(_,i)=>({...row('revoked'),id:syntheticId(i)})));f.setServerCap(10);
 await assert.rejects(f.repo.page(guardian),e=>e.code==='RESPONSE');
});
test('pagination preserves microsecond cursor precision and ignores inserts ahead of the cursor',async()=>{
 const f=fixture(guardian);const rows=Array.from({length:30},(_,i)=>({...row('revoked'),id:syntheticId(i),created_at:`2026-11-04T01:00:00.${String(i).padStart(6,'0')}Z`}));f.setRows(rows);
 const first=await f.repo.page(guardian);assert.equal(first.next.createdAt,'2026-11-04T01:00:00.000005Z');
 f.setRows([{...row(),id:syntheticId(99),created_at:'2026-11-05T00:00:00Z'},...rows]);
 const second=await f.repo.page(guardian,first.next);assert.equal(second.rows.length,5);assert.equal(new Set([...first.rows,...second.rows].map(x=>x.id)).size,30);
});
test('hook discards pages if the server capability changes while browsing history',async()=>{
 const app=mountHook({page:async(_actor,cursor)=>({rows:[row()],next:cursor?null:{id:L,createdAt:row().created_at},supportsReconnect:!cursor})});
 await app.flush();await app.state.loadMore();await app.flush();assert.equal(app.state.ready,false);assert.equal(app.state.rows.length,0);assert.equal(app.state.supportsReconnect,false);app.dispose();
});
