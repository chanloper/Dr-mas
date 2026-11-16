const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,globals={}){const box={exports:{},...globals};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
test('RAG diagnostic is a closed allowlist without questions, sources, URLs, JWT or raw errors',()=>{
 const api=load('ragDiagnostics');
 const secret='private-marker';const record=api.safeRagDiagnostic('error','http',-1,{status:secret,sources:[],question:secret,token:secret},{code:secret,message:secret,cause:secret});
 assert.equal(record.code,'UNRECOGNIZED');assert.equal(record.elapsedMs,0);assert.equal(record.status,null);
 assert.ok(!JSON.stringify(record).includes(secret));
 const success=api.safeRagDiagnostic('success','response',12.3,{status:'local_evidence',sources:[{quote:secret}]});
 assert.equal(success.sourceCount,1);assert.equal(success.status,'local_evidence');assert.ok(!JSON.stringify(success).includes(secret));
});
test('RAG diagnostic is disabled outside development and logging errors cannot fail a request',()=>{
 let calls=0;const api=load('ragDiagnostics',{__DEV__:false,console:{info:()=>calls++}});api.logRagDiagnostic('start','session',0);assert.equal(calls,0);
 const broken=load('ragDiagnostics',{__DEV__:true,console:{info:()=>{throw Error('unavailable');}}});assert.doesNotThrow(()=>broken.logRagDiagnostic('start','session',0));
});
test('RAG service preserves request/response and emits bounded stages and final validation result',async()=>{
 const logs=[],reply={status:'local_evidence',sources:[{}],text:'synthetic'};
 const api=load('rag',{__DEV__:true,process:{env:{EXPO_PUBLIC_RAG_API_URL:'http://127.0.0.1:8787'}},require:name=>{
  if(name==='./auth')return {readToken:async()=>'synthetic'};
  if(name==='./ragDiagnostics')return {logRagDiagnostic:(...args)=>logs.push(args)};
  if(name==='./ragClient')return {validateRagBaseUrl:()=>new URL('http://127.0.0.1:8787'),requestRagResult:async(question,options)=>{
   assert.equal(question,'synthetic');assert.equal(await options.token(),'synthetic');options.onStage('http');options.onStage('response');return reply;
  }};
  throw Error('unexpected dependency');
 }});
 assert.equal(await api.sendRagChat('synthetic'),reply);assert.deepEqual(logs.map(x=>x[0]),['start','stage','stage','success']);
 assert.equal(logs.at(-1)[1],'response');assert.equal(logs.at(-1)[3],reply);
});

test('development connection label shows only the validated POST endpoint and is absent in production',()=>{
 const client=load('ragClient',{URL});
 const service=(development,url)=>load('rag',{__DEV__:development,URL,process:{env:{EXPO_PUBLIC_RAG_API_URL:url}},require:name=>name==='./ragClient'?client:name==='./auth'?{readToken:async()=>{throw Error('must not read session');}}:{logRagDiagnostic(){}}});
 assert.equal(service(true,'http://192.168.0.3:8787').ragDevelopmentEndpoint(),'POST http://192.168.0.3:8787/api/rag/chat');
 assert.equal(service(false,'https://example.org').ragDevelopmentEndpoint(),null);
 for(const url of ['http://user:private@example.org','https://example.org?TOKEN=private','invalid'])assert.equal(service(true,url).ragDevelopmentEndpoint(),null);
});
