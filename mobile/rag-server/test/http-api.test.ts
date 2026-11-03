import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRagServer,localChat,supabaseVerifier,ApiError,disclaimer } from '../src/http-api.js';
import { emptyState } from '../src/model.js';
import { register } from '../src/repository.js';
import { fixture,withRepo } from './helpers.js';
import { loadEnvFile } from 'node:process';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const result={status:'insufficient_evidence',message:'확인된 자료가 부족하여 답변할 수 없습니다',sources:[],disclaimer,mode:'local' as const};
async function serve(run:(url:string)=>Promise<void>,overrides:Partial<Parameters<typeof createRagServer>[0]>={}) {
 const server=createRagServer({verify:async token=>{if(token!=='valid')throw new ApiError(401,'UNAUTHORIZED');return 'fictional-user';},chat:async()=>result,...overrides});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error();
 try{await run(`http://127.0.0.1:${address.port}/api/rag/chat`);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
const post=(url:string,body:unknown={question:'일반 질문'},token='valid')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
test('HTTP rejects absent, forged tokens before search; no body identity trusted',async()=>{
 let calls=0;await serve(async url=>{
  assert.equal((await post(url,{},'')).status,401);
  assert.equal((await post(url,{},'forged')).status,401);
  assert.equal((await post(url,{question:'일반 질문',userId:'another-user'})).status,400);
  assert.equal(calls,0);
  assert.equal((await post(url)).status,200);assert.equal(calls,1);
 },{chat:async()=>{calls++;return result;}});
});
test('body limits, invalid JSON, content type and CORS fail closed',async()=>serve(async url=>{
 assert.equal((await post(url,{question:'a'.repeat(9000)})).status,413);
 assert.equal((await post(url,{question:'a'.repeat(2001)})).status,400);
 assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await fetch(url,{method:'POST'})).status,415);
 assert.equal((await fetch(url,{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}})).status,403);
 const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:'https://app.example'}});assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('access-control-allow-origin'),'https://app.example');
},{origins:['https://app.example']}));
test('per-user quota and sanitized internal error',async()=>{
 await serve(async url=>{assert.equal((await post(url)).status,200);assert.equal((await post(url)).status,429);},{rateLimit:1});
 await serve(async url=>{const r=await post(url);assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'SERVER_ERROR'});},{chat:async()=>{throw Error('synthetic-private-error');}});
});
test('deadline blocks slow verification and prevents search',async()=>{
 let calls=0;await serve(async url=>{const r=await post(url);assert.equal(r.status,504);},{timeoutMs:30,verify:async()=>new Promise(resolve=>setTimeout(()=>resolve('user'),70)),chat:async()=>{calls++;return result;}});assert.equal(calls,0);
});
test('Supabase verifies through configured Auth endpoint, never decodes or accepts upstream failures',async()=>{
 let calls=0;const transport:typeof fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://project.example/auth/v1/user');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer opaque-test-token');return new Response(JSON.stringify({id:'fictional-user'}));};
 assert.equal(await supabaseVerifier('https://project.example','sb_publishable_mock',transport)('opaque-test-token',new AbortController().signal),'fictional-user');assert.equal(calls,1);
 for(const status of [401,403,500])await assert.rejects(supabaseVerifier('https://project.example','sb_publishable_mock',async()=>new Response('{}',{status}))('forged',new AbortController().signal),e=>e instanceof ApiError&&e.status===(status===500?503:401));
 assert.throws(()=>supabaseVerifier('http://project.example','sb_publishable_mock'));
 assert.throws(()=>supabaseVerifier('https://project.example','service_role_mock'));
});
test('pending and test-only sources excluded, permitted local quotes keep real ids, no provider invoked',async()=>withRepo(async repo=>{
 const doc=fixture('allowed','테스트성분알파 안내를 위한 합성 자료입니다.');
 await register(repo,doc);assert.equal((await localChat(repo,'테스트성분알파')).status,'insufficient_evidence');
 await register(repo,{...doc,rights:{...doc.rights,permission:'pending'}});assert.equal((await localChat(repo,'테스트성분알파')).sources.length,0);
 await register(repo,{...doc,rights:{...doc.rights,permission:'permitted'}});
 const r=await localChat(repo,'테스트성분알파');assert.equal(r.status,'local_evidence');assert.equal(r.sources[0]?.documentId,'allowed');assert.equal(r.sources[0]?.quote,doc.content);
 assert.equal((await repo.read()).usage.calls,0);
}));
test('empty corpus abstains and safety routing needs no provider',async()=>{
 const repo={read:async()=>emptyState(),transaction:async()=>{throw Error();}};
 assert.equal((await localChat(repo,'일반 질문')).status,'insufficient_evidence');
 assert.equal((await localChat(repo,'호흡곤란')).status,'emergency');
 assert.equal((await localChat(repo,'환자명 홍길동')).status,'privacy');
});
test('local environment loading preserves process-injected configuration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drmas-env-'));
 const previous=process.env.DRMAS_HTTP_ENV_TEST;
 try{
  process.env.DRMAS_HTTP_ENV_TEST='injected-test';
  await writeFile(join(dir,'.env'),'DRMAS_HTTP_ENV_TEST=file-test\n');
  loadEnvFile(join(dir,'.env'));assert.equal(process.env.DRMAS_HTTP_ENV_TEST,'injected-test');
 }finally{if(previous===undefined)delete process.env.DRMAS_HTTP_ENV_TEST;else process.env.DRMAS_HTTP_ENV_TEST=previous;await rm(dir,{recursive:true,force:true});}
});
test('one-shot observation emits only allowlisted status/type once; disabled by default',async()=>{
 const observations:unknown[]=[];
 await serve(async url=>{
  await post(url);await post(url);
 },{observeOnce:r=>observations.push(r)});
 assert.deepEqual(observations,[{httpStatus:200,responseType:'insufficient_evidence'}]);
 for(const [status,code] of [[401,'UNAUTHORIZED'],[503,'AUTH_UNAVAILABLE']] as const){
  const events:unknown[]=[];
  await serve(async url=>{await post(url);},{verify:async()=>{throw new ApiError(status,code);},observeOnce:r=>events.push(r)});
  assert.deepEqual(events,[{httpStatus:status,responseType:code}]);
 }
});
