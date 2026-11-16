// Synthetic fixtures only. No remote database, SOS delivery or phone invocation.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,globals={}) {
 const box={exports:{},AbortController,setTimeout,clearTimeout,...globals};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
 return box.exports;
}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',L='33333333-3333-4333-8333-333333333333';
const actor={id:A,role:'guardian'},names=load('careNames');
test('approved-name lookup verifies session, uses no target parameters, and preserves actual labels',async()=>{
 let calls=0;const client={auth:{getUser:async()=>({data:{user:{id:A}}})},rpc(name,args){calls++;assert.equal(name,'list_approved_care_names');assert.equal(args,undefined);return {abortSignal:async()=>({data:[{care_link_id:L,counterpart_id:B,display_name:'등록한 이름'}]})};}};
 const rows=await names.withCareNames(client,actor,[{id:L,status:'approved',patient_id:B,guardian_id:A}]);
 assert.equal(names.careNameLabel(rows[0]),'등록한 이름');assert.equal(calls,1);
 assert.equal(names.careNameLabel({status:'approved',display_name:null}),'이름 미등록');
 assert.equal(names.careNameLabel({status:'approved'}),'이름 확인 불가');
 assert.equal(names.careNameLabel({status:'pending',display_name:'hidden'}),'이름 확인 불가');
 client.auth.getUser=async()=>({data:{user:{id:B}}});
 assert.equal((await names.readApprovedCareNames(client,actor)).length,0);assert.equal(calls,1);
});
test('missing RPC, RLS errors, malformed data and unrelated link names fail closed',async()=>{
 for(const response of [{error:{code:'PGRST202'}},{error:{code:'42501'}},{data:[{care_link_id:L,counterpart_id:A,display_name:'hidden'}]},{data:[{care_link_id:L,counterpart_id:B,display_name:123}]}]){
  const c={auth:{getUser:async()=>({data:{user:{id:A}}})},rpc:()=>({abortSignal:async()=>response})};
  assert.equal((await names.readApprovedCareNames(c,actor)).length,0);
 }
 const c={auth:{getUser:async()=>({data:{user:{id:A}}})},rpc:()=>({abortSignal:async()=>({data:[{care_link_id:L,counterpart_id:B,display_name:'허용된 이름'}]})})};
 const rows=await names.withCareNames(c,actor,[{id:L,status:'revoked',patient_id:B,guardian_id:A},{id:B,status:'approved',patient_id:B,guardian_id:A}]);
 assert.ok(rows.every(r=>r.display_name===undefined));
});
test('Realtime scopes participants, ignores payload, resyncs after reconnect and cleans old callbacks',async()=>{
 const timers=new Map();let id=0,changed=0,removed=0;const channels=[],states=[];
 const api=load('sosRealtime',{setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const client={auth:{getUser:async()=>({data:{user:{id:A}}})},channel(){const c={on(_kind,filter,fn){c.filter=filter;c.event=fn;return c;},subscribe(fn){c.status=fn;return c;}};channels.push(c);return c;},removeChannel:async()=>{removed++;}};
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
 const stop=api.watchSos(client,actor,()=>changed++,state=>states.push(state));await flush();
 assert.equal(channels[0].filter.filter,'guardian_id=eq.'+A);
 channels[0].status('SUBSCRIBED');assert.equal(changed,1);
 channels[0].event({new:{patient_id:'forged'}});assert.equal(changed,2);
 channels[0].status('CHANNEL_ERROR');channels[0].status('TIMED_OUT');assert.equal(timers.size,1);
 [...timers.values()][0]();timers.clear();await flush();assert.equal(channels.length,2);assert.equal(removed,1);
 channels[0].event({});assert.equal(changed,2);
 channels[1].status('SUBSCRIBED');assert.equal(changed,3);
 stop();channels[1].event({});channels[1].status('CLOSED');await flush();
 assert.equal(changed,3);assert.equal(removed,2);assert.equal(timers.size,0);assert.ok(states.includes('disconnected'));
});
test('mismatched login never opens a Realtime channel',async()=>{
 let opened=0;const api=load('sosRealtime',{setTimeout:()=>1,clearTimeout:()=>{}});
 const stop=api.watchSos({auth:{getUser:async()=>({data:{user:{id:B}}})},channel(){opened++;}},actor,()=>assert.fail(),()=>{});
 await new Promise(r=>setImmediate(r));assert.equal(opened,0);stop();
});
