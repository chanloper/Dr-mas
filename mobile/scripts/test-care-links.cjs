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
function service(){const s={exports:{}};vm.runInNewContext(compile('src/services/careLinks.ts'),s);return s.exports;}
function fixture(actor=patient){
 const api=service(),calls=[],queries=[];let rows=[row()],authError=null,authId=actor.id,rpcError=null,rpcData=L,queryError=null,unfiltered=false;
 const client={auth:{getUser:async()=>({data:{user:authId?{id:authId}:null},error:authError})},
  from(table){assert.equal(table,'care_links');const filters=[];queries.push({table,filters});let cap=101;
   const result=()=>({data:unfiltered?rows:rows.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(0,cap),error:queryError});
   const q={select(fields){assert.ok(!fields.includes('email'));return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(n){cap=n;return q;},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]??null};},then(yes,no){return Promise.resolve(result()).then(yes,no);}};return q;},
  rpc:async(name,args)=>{calls.push({name,args});return {data:rpcData,error:rpcError};}};
 return {api,repo:api.createCareLinkRepository(client),calls,queries,setRows:v=>{rows=v;},setAuth:(id,error=null)=>{authId=id;authError=error;},setRpc:(error,data=L)=>{rpcError=error;rpcData=data;},setQueryError:e=>{queryError=e;},unfilter:()=>{unfiltered=true;}};
}
test('guardian request uses exact RPC signature; patient, self and malformed ID are blocked',async()=>{
 const f=fixture(guardian);assert.equal(await f.repo.request(guardian,A),L);assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'request_care_link',args:{target_patient:A}}]);
 for(const [actor,target,code]of [[patient,B,'ROLE'],[guardian,G,'SELF'],[guardian,'not-a-uuid','INPUT']])await assert.rejects(f.repo.request(actor,target),e=>e.code===code);
 assert.equal(f.calls.length,1);
});
test('expired and mismatched sessions stop before any query or RPC',async()=>{
 const f=fixture(guardian);f.setAuth(B);await assert.rejects(f.repo.request(guardian,A),e=>e.code==='AUTH');
 f.setAuth(null,{status:401,message:'private upstream'});await assert.rejects(f.repo.list(guardian),e=>e.code==='AUTH');
 assert.equal(f.calls.length,0);assert.equal(f.queries.length,0);
});
test('duplicate/nonexistent-or-disallowed accounts and server errors have safe distinct messages',async()=>{
 const f=fixture(guardian);
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
test('malformed RPC output, permission failure and oversized lists fail closed',async()=>{
 const f=fixture(guardian);f.setRpc(null,'invalid');await assert.rejects(f.repo.request(guardian,A),e=>e.code==='RESPONSE');
 f.setRpc({code:'42501'},null);await assert.rejects(f.repo.decide(guardian,L,'cancel'),e=>e.code==='STALE');
 f.setRows(Array.from({length:101},()=>row()));await assert.rejects(f.repo.list(guardian),e=>e.code==='LIMIT');
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
 let slots=[],cursor=0,calls=[];const model={rows:links,ready:true,busy:false,error:null,notice:null,refresh:async()=>{},perform:async(...args)=>{calls.push(args);return true;}};
 const sandbox={exports:{},require:name=>{
  if(name==='react/jsx-runtime')return require(name);
  if(name==='react')return {...React,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];}};
  if(name==='react-native')return {Text:'Text',TextInput:'TextInput',View:'View'};
  if(name==='../features/care/useCareLinks')return {useCareLinks:()=>model};
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
 const api=service();const box={exports:{},require:name=>{
  if(name==='react')return hooks;
  if(name==='react-native')return {AppState:{addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}}};
  if(name==='../../services/supabase')return {getSupabaseClient:()=>({})};
  if(name==='../../services/careLinks')return {...api,createCareLinkRepository:()=>repo};
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
 const box={exports:{},require:name=>{
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
