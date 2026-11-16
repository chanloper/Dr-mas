// Mock transport only. Never uses real sessions or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ids={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222',G:'33333333-3333-4333-8333-333333333333',H:'44444444-4444-4444-8444-444444444444'};
function fixture(){let actor='A',enabled=true,project=true,error=false,leak=false,meds=1,profileBad=false,switchDuring=false,clock=0,subscribe,sosAll=1,sosRecipient=1,sosError=false;const calls=[];
 const sandbox={exports:{},__DEV__:true,process:{env:{EXPO_PUBLIC_APP_ENV:'development',EXPO_PUBLIC_RLS_DIAGNOSTICS:'1',EXPO_PUBLIC_EXPECTED_SUPABASE_REF:'synthetic-project'}},AbortController,setTimeout,clearTimeout,Date:class extends Date {static now(){return clock;}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/dev/rlsDiagnostics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);const api=sandbox.exports;
 const client={auth:{getUser:async()=>({data:{user:actor?{id:ids[actor]}:null},error:null}),onAuthStateChange(fn){subscribe=fn;return {data:{subscription:{unsubscribe(){subscribe=null;}}}};}},from(table){const filters={};let head=false;const q={select(fields,options){head=options?.head===true;if(head)assert.ok(['id','medication_id'].includes(fields));calls.push({table,fields,head,filters});return q;},eq(k,v){filters[k]=v;return q;},limit(){return q;},abortSignal:async()=>{
 if(switchDuring&&head){subscribe('SIGNED_OUT',null);}
 const role=['A','B'].includes(actor)?'patient':'guardian';
 if(!head)return {data:profileBad?[]:[{id:ids[actor],role}],error:null};
 if(error)return {count:null,error:{message:'PRIVATE_UPSTREAM_UUID_TOKEN'}};
 if(table==='sos_alerts'&&sosError)return {count:null,error:{message:'PRIVATE_SOS_ERROR'}};
 let count=0;if(table==='sos_alerts')count=actor==='A'?(filters.guardian_id?sosRecipient:sosAll):actor==='G'?sosRecipient:leak?1:0;
 else if(table==='profiles')count=filters.id===ids[actor]?1:0;
 else if(['A','G'].includes(actor))count=table==='care_links'?(filters.status?1:2):meds;
 else count=leak?1:0;
 return {count,error:null};}};return q;}};
 const repo=api.createRlsDiagnostics(client,()=>enabled,()=>project);return {api,repo,calls,run:label=>repo.run(label,ids.A,ids.G),actor:v=>actor=v,enable:v=>enabled=v,project:v=>project=v,error:v=>error=v,leak:v=>leak=v,meds:v=>meds=v,profileBad:v=>profileBad=v,switchDuring:()=>switchDuring=true,expire:()=>clock=16*60*1000,sandbox,sosCounts:(all,recipient)=>{sosAll=all;sosRecipient=recipient;},sosError:v=>sosError=v};
}
test('A baseline then G/B/H policies produce count-only PASS summaries',async()=>{
 const f=fixture();for(const actor of ['A','G','B','H']){f.actor(actor);const rows=await f.run(actor);assert.ok(rows.every(r=>r.result==='PASS'));const text=JSON.stringify(rows);Object.values(ids).forEach(id=>assert.ok(!text.includes(id)));assert.ok(!text.includes('PRIVATE'));}
 assert.ok(f.calls.filter(c=>c.head&&c.table==='care_links').every(c=>c.filters.patient_id===ids.A&&[ids.G,ids.H].includes(c.filters.guardian_id)));
});
test('disabled dev/project gate stops before any query',async()=>{
 const f=fixture();f.enable(false);assert.equal((await f.run('A'))[0].reason,'DEV_ONLY');f.enable(true);f.project(false);assert.equal((await f.run('A'))[0].reason,'PROJECT');assert.equal(f.calls.length,0);
 f.sandbox.__DEV__=false;assert.equal(f.api.rlsDiagnosticsEnabled(),false);f.sandbox.__DEV__=true;f.sandbox.process.env.EXPO_PUBLIC_APP_ENV='production';assert.equal(f.api.rlsDiagnosticsEnabled(),false);
});
test('without A fixture evidence zero-row denials remain unverified',async()=>{
 const f=fixture();f.actor('H');const rows=await f.run('H');assert.equal(rows[0].result,'PASS');assert.ok(rows.slice(1).filter(r=>r.check!=='H–A 승인 연결 없음').every(r=>r.result==='미검증'));
});
test('empty A synthetic data fails positive checks and cannot create baseline',async()=>{
 const f=fixture();f.meds(0);assert.ok((await f.run('A')).some(r=>r.result==='FAIL'));f.actor('B');assert.ok((await f.run('B')).slice(1).every(r=>r.result==='미검증'));
});
test('expired/cleared baseline makes negative checks unverified',async()=>{
 const f=fixture();await f.run('A');f.expire();f.actor('H');assert.ok((await f.run('H')).slice(1).filter(r=>r.check!=='H–A 승인 연결 없음').every(r=>r.result==='미검증'));
 f.actor('A');await f.run('A');f.repo.clearBaseline();f.actor('B');assert.ok((await f.run('B')).slice(1).every(r=>r.result==='미검증'));
});
test('actual leaked rows fail even if no baseline exists',async()=>{
 const f=fixture();f.actor('H');f.leak(true);assert.ok((await f.run('H')).some(r=>r.reason==='UNEXPECTED_COUNT'&&r.result==='FAIL'));
});
test('auth absence, mislabelled account and unreadable own profile stop the run',async()=>{
 const f=fixture();f.actor(null);assert.equal((await f.run('A'))[0].reason,'AUTH');f.actor('B');assert.equal((await f.run('A'))[0].reason,'ACCOUNT');f.profileBad(true);assert.equal((await f.run('B'))[0].reason,'OWN_PROFILE');
});
test('query errors never count as denied PASS and upstream error text is discarded',async()=>{
 const f=fixture();await f.run('A');f.actor('H');f.error(true);const rows=await f.run('H');assert.ok(rows.slice(1).every(r=>r.result==='FAIL'&&r.error));assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
});
test('session change during queries invalidates all partial results',async()=>{
 const f=fixture();f.switchDuring();const rows=await f.run('A');assert.equal(rows.length,1);assert.equal(rows[0].result,'FAIL');
});
test('diagnostic route has independent fail-closed guard and only Settings can expose a guarded entry',()=>{
 const route=fs.readFileSync('src/app/_dev/rls-check.tsx','utf8'),layout=fs.readFileSync('src/app/_layout.tsx','utf8');assert.match(route,/if \(!rlsDiagnosticsEnabled\(\)\) return <Redirect/);assert.match(layout,/Stack.Protected guard=\{rlsDiagnosticsEnabled\(\)\}/);
 assert.match(layout,/initialRouteName: 'index'/);assert.ok(layout.indexOf('name="index"')<layout.indexOf('Stack.Protected'));
 for(const f of fs.readdirSync('src/screens'))if(f.endsWith('.tsx')&&f!=='SettingsScreen.tsx')assert.ok(!fs.readFileSync('src/screens/'+f,'utf8').includes('rls-check'));
 const source=fs.readFileSync('src/dev/rlsDiagnostics.ts','utf8');assert.ok(!/\.\s*(insert|upsert|update|delete|rpc)\s*\(|console\.|AsyncStorage|SecureStore/.test(source));
});
test('Settings exposes RLS entry only under the existing dev gate; clicking rechecks the gate',()=>{
 const f=fixture(),routes=[];
 const code=ts.transpileModule(fs.readFileSync('src/screens/SettingsScreen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const box={exports:{},require:name=>{
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name==='expo-router')return {useRouter:()=>({push:p=>routes.push(p)})};
  if(name==='react-native')return {Pressable:'Pressable',Text:'Text',View:'View'};
  if(name==='../features/app/context')return {useDrMAS:()=>({roleLabel:'합성',user:null,sosDelay:10,setSosDelay(){},signOut(){}})};
  if(name==='../components/ui')return {Action:'Action',Chip:'Chip',Panel:'Panel',TitleRow:'TitleRow',C:{},s:{}};
  if(name==='../components/SosDelaySlider')return {SosDelaySlider:'SosDelaySlider'};
  if(name==='../components/CareLinksPanel')return {CareLinksPanel:'CareLinksPanel'};
  if(name==='../dev/DevNotificationsPanel')return {DevNotificationsPanel:'DevNotificationsPanel'};
  if(name==='../dev/rlsDiagnostics')return f.api;
  throw Error('unexpected dependency');
 }};vm.runInNewContext(code,box);
 function entry(){const nodes=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children);}}visit(box.exports.default());return nodes.find(n=>n.props?.label==='RLS 보안 검사');}
 const button=entry();assert.ok(button);button.props.onPress();assert.deepEqual(routes,['/_dev/rls-check']);
 f.sandbox.__DEV__=false;assert.equal(entry(),undefined);button.props.onPress();assert.equal(routes.length,1);
 f.sandbox.__DEV__=true;f.sandbox.process.env.EXPO_PUBLIC_RLS_DIAGNOSTICS='0';assert.equal(entry(),undefined);
 f.sandbox.process.env.EXPO_PUBLIC_RLS_DIAGNOSTICS='1';f.sandbox.process.env.EXPO_PUBLIC_APP_ENV='production';assert.equal(entry(),undefined);
});
const sosRows=rows=>rows.filter(r=>r.check.includes('SOS'));
test('SOS denials require both A and G actual positive evidence in sequence',async()=>{
 const f=fixture();await f.run('A');f.actor('B');assert.ok(sosRows(await f.run('B')).every(r=>r.result==='미검증'));
 f.actor('G');assert.ok(sosRows(await f.run('G')).every(r=>r.result==='PASS'));
 for(const actor of ['B','H']){f.actor(actor);const rows=sosRows(await f.run(actor));assert.ok(rows.every(r=>r.count===0&&!r.error&&r.result==='PASS'));}
});
test('SOS patient sees all recipients while G only sees own deliveries',async()=>{
 const f=fixture();f.sosCounts(3,1);const a=sosRows(await f.run('A'));assert.equal(JSON.stringify(a.map(r=>r.count)),JSON.stringify([3,1]));
 f.actor('G');const g=sosRows(await f.run('G'));assert.ok(g.every(r=>r.count===1&&r.result==='PASS'));
 assert.ok(f.calls.filter(c=>c.table==='sos_alerts').every(c=>c.head&&c.filters.patient_id===ids.A));
});
test('empty SOS fixtures never establish a positive baseline or pass a denial',async()=>{
 const f=fixture();f.sosCounts(0,0);assert.ok(sosRows(await f.run('A')).every(r=>r.result==='FAIL'));
 f.actor('H');assert.ok(sosRows(await f.run('H')).every(r=>r.result==='미검증'));
});
test('missing SOS schema or transport errors fail and discard raw error text',async()=>{
 const f=fixture();await f.run('A');f.actor('G');await f.run('G');f.actor('H');f.sosError(true);
 const rows=sosRows(await f.run('H'));assert.ok(rows.every(r=>r.error&&r.count===null&&r.result==='FAIL'));assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
});
test('unexpected SOS exposure fails without any positive baseline',async()=>{
 const f=fixture();f.actor('H');f.leak(true);assert.ok(sosRows(await f.run('H')).every(r=>r.result==='FAIL'));
});
test('failed G recheck invalidates prior G evidence; expiration also prevents SOS PASS',async()=>{
 const f=fixture();await f.run('A');f.actor('G');await f.run('G');f.sosCounts(1,0);assert.ok(sosRows(await f.run('G')).every(r=>r.result==='FAIL'));
 f.actor('B');assert.ok(sosRows(await f.run('B')).every(r=>r.result==='미검증'));
 f.sosCounts(1,1);f.actor('A');await f.run('A');f.actor('G');await f.run('G');f.expire();f.actor('H');assert.ok(sosRows(await f.run('H')).every(r=>r.result==='미검증'));
});
