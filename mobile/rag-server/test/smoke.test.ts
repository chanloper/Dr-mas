import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSmoke, smokeInputs, smokeLimits } from '../src/smoke.js';
import { answer } from '../src/answer.js';
import { SearchIndex, insufficientEvidenceMessage } from '../src/search.js';
import { GuardedProvider, defaultLimits, type Provider } from '../src/gemini.js';
import { register } from '../src/repository.js';
import { fixture, withRepo } from './helpers.js';
async function withMarker(fn:(marker:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'drmas-smoke-'));try{await fn(join(dir,'attempt.json'));}finally{await rm(dir,{recursive:true,force:true});}}
const placeholder='unit-test-placeholder-not-a-real-key';
test('all insufficient-evidence answer paths and search use the requested Korean message',async()=>withRepo(async repo=>{
 const check=(r:{status:string;message?:string})=>{assert.equal(r.status,'insufficient_evidence');assert.equal(r.message,'확인된 자료가 부족하여 답변할 수 없습니다');};
 check(new SearchIndex(await repo.read()).search('XYZ999'));check(await answer(repo,'XYZ999'));
 const p:Provider={embed:async()=>Array.from({length:768},(_,i)=>i===0?1:0),select:async()=>'{"abstain":true,"claims":[]}'};
 const api=new GuardedProvider(repo,p,{...defaultLimits,intervalMs:0});
 check(await answer(repo,'XYZ999',{api,publicQuestion:true}));
 const doc=fixture();doc.rights.permission='permitted';await register(repo,doc);
 check(await answer(repo,'XYZ999',{api,publicQuestion:true}));
 check(await answer(repo,'테스트성분알파',{api,publicQuestion:true}));
 assert.equal(insufficientEvidenceMessage,'확인된 자료가 부족하여 답변할 수 없습니다');
}));
test('SDK embedding smoke uses one mocked HTTP request, short synthetic input, no retry; repeat blocked',async()=>withMarker(async marker=>{
 let calls=0;
 const factory=()=>new GoogleGenAI({apiKey:placeholder,httpOptions:{retryOptions:{attempts:1},fetch:async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body));assert.ok(JSON.stringify(body).includes(smokeInputs.embedding));
   assert.equal(body.requests.length,1);assert.equal(body.requests[0].outputDimensionality,768);assert.equal(body.requests[0].taskType,'RETRIEVAL_QUERY');
   return new Response(JSON.stringify({embeddings:[{values:Array.from({length:768},(_,i)=>i===0?1:0)}]}),{status:200,headers:{'content-type':'application/json'}});
 }}});
 const result=await runSmoke({key:placeholder,kind:'embedding',marker},factory);
 assert.equal(result.status,'embedding_success');assert.equal(result.apiCalls,1);assert.equal(calls,1);
 await assert.rejects(runSmoke({key:placeholder,kind:'embedding',marker},factory),/SMOKE_ALREADY_RESERVED/);assert.equal(calls,1);
 const saved=await readFile(marker,'utf8');assert.ok(!saved.includes(placeholder));assert.ok(!JSON.stringify(result).includes(placeholder));
}));
test('SDK generation smoke uses one mocked request and a 64-output-token cap',async()=>withMarker(async marker=>{
 let calls=0;const factory=()=>new GoogleGenAI({apiKey:placeholder,httpOptions:{retryOptions:{attempts:1},fetch:async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body));assert.equal(body.generationConfig.maxOutputTokens,64);
   return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'베타'}]}}]}),{status:200,headers:{'content-type':'application/json'}});
 }}});
 const result=await runSmoke({key:placeholder,kind:'generation',generationModel:'test-only-model',marker},factory);
 assert.equal(result.status,'generation_success');assert.equal(calls,1);assert.equal(smokeLimits.maxCalls,1);
 assert.ok(Object.values(smokeInputs).every(t=>t.length<=smokeLimits.maxInputCharacters));
}));
test('429 consumes the entire smoke budget, redacts upstream error and never retries',async()=>withMarker(async marker=>{
 let calls=0;const factory=()=>new GoogleGenAI({apiKey:placeholder,httpOptions:{retryOptions:{attempts:1},fetch:async()=>{
   calls++;return new Response(JSON.stringify({error:{code:429,message:placeholder,status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'content-type':'application/json'}});
 }}});
 await assert.rejects(runSmoke({key:placeholder,kind:'embedding',marker},factory),e=>e instanceof Error&&!e.message.includes(placeholder)&&e.message.includes('SMOKE_CALL_FAILED'));
 assert.equal(calls,1);
 await assert.rejects(runSmoke({key:placeholder,kind:'generation',generationModel:'test-only-model',marker},factory),/SMOKE_ALREADY_RESERVED/);assert.equal(calls,1);
}));
test('missing key/model preflight consumes no smoke reservation or requests',async()=>withMarker(async marker=>{
 let clients=0;const factory=()=>{clients++;throw new Error('must not construct');};
 await assert.rejects(runSmoke({key:'',kind:'embedding',marker},factory),/KEY_INPUT_REQUIRED/);
 await assert.rejects(runSmoke({key:placeholder,kind:'generation',marker},factory),/GEMINI_GENERATION_MODEL_REQUIRED/);
 assert.equal(clients,0);await assert.rejects(readFile(marker),{code:'ENOENT'});
}));
