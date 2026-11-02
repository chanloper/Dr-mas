import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { GeminiProvider, GuardedProvider, indexDocuments, embeddingSettings, embeddingProfile } from '../src/gemini.js';
import { runSemanticTrial, mockSemanticProvider, semanticDocuments, semanticLimits, syntheticAllowlist, semanticCostPreflight, TransientRepository } from '../src/semantic-trial.js';
import { register } from '../src/repository.js';
import { fixture, withRepo } from './helpers.js';
import { hash } from '../src/model.js';
test('semantic mock finds a synonym-only document while keyword search abstains',async()=>{
 const r=await runSemanticTrial(new TransientRepository(),mockSemanticProvider(),'mock');
 assert.equal(r.mock,true);assert.equal(r.actualEmbeddingCalls,0);assert.equal(r.mockEmbeddingCalls,3);
 assert.equal(r.status,'semantic_search_success');assert.equal(r.keywordOnly.status,'insufficient_evidence');
 assert.equal(r.hits[0]!.documentId,'semantic-rest');assert.equal(r.hits[0]!.keywordScore,0);assert.equal(r.hits[0]!.vectorScore,1);
 assert.equal(r.rankings.find(h=>h.documentId==='semantic-activity')!.vectorScore,0);
});
test('real SDK adapter with mocked HTTP indexes documents and searches after disk reload',async()=>withRepo(async repo=>{
 let calls=0;const tasks:string[]=[];
 const p=new GeminiProvider('unit-test-placeholder-not-a-real-key',undefined,{fetch:async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body));assert.equal(body.requests.length,1);
   const request=body.requests[0];assert.equal(request.model,`models/${embeddingSettings.model}`);assert.equal(request.outputDimensionality,768);
   tasks.push(request.taskType);const text=request.content.parts[0].text as string;
   const values=Array.from({length:768},(_,i)=>i===(text.includes('걷기')?1:0)?3:0);
   return new Response(JSON.stringify({embeddings:[{values}]}),{status:200,headers:{'content-type':'application/json'}});
 }});
 const r=await runSemanticTrial(repo,p,'mock');assert.equal(calls,3);assert.equal(r.actualEmbeddingCalls,0);assert.equal(r.semanticSearchPassed,true);
 assert.deepEqual(tasks,['RETRIEVAL_DOCUMENT','RETRIEVAL_DOCUMENT','RETRIEVAL_QUERY']);assert.equal(embeddingProfile,'gemini-embedding-001:768:retrieval:v1');
 const stored=await repo.read();assert.equal(stored.usage.calls,3);assert.equal(Object.keys(stored.vectors).length,2);
 for(const v of Object.values(stored.vectors)){assert.equal(v.values.length,768);assert.ok(Math.abs(Math.hypot(...v.values)-1)<1e-10);}
 assert.ok(Object.values(stored.documents).every(d=>d.rights.permission==='test-only'));
 const api=new GuardedProvider(repo,p,{...semanticLimits,intervalMs:0});
 assert.equal((await indexDocuments(repo,api,2,{syntheticTestDocuments:syntheticAllowlist()})).indexed,0);assert.equal(calls,3);
 await assert.rejects(api.embed('extra','RETRIEVAL_QUERY'),/USAGE_BUDGET_EXCEEDED/);assert.equal(calls,3);
 assert.ok(!JSON.stringify(stored).includes('unit-test-placeholder'));
}));
test('normal indexing still excludes synthetic docs; allowlist requires exact ID and hash',async()=>withRepo(async repo=>{
 for(const d of semanticDocuments)await register(repo,d);
 await register(repo,fixture('outside','선택되지 않은 가상 자료입니다.'));
 const api=new GuardedProvider(repo,mockSemanticProvider(),{...semanticLimits,intervalMs:0});
 assert.equal((await indexDocuments(repo,api)).indexed,0);
 const invalid=new Map([['semantic-rest',hash('different content')]]);
 assert.equal((await indexDocuments(repo,api,2,{syntheticTestDocuments:invalid})).indexed,0);
 assert.equal((await indexDocuments(repo,api,2,{syntheticTestDocuments:syntheticAllowlist()})).indexed,2);
 assert.equal((await repo.read()).usage.calls,2);
}));
test('semantic CLI refuses live mode without explicit three-call approval',()=>{
 const r=spawnSync(process.execPath,['--import','tsx','src/semantic-check.ts','--live'],{encoding:'utf8',env:{...process.env,GEMINI_API_KEY:'',GOOGLE_API_KEY:''}});
 assert.equal(r.status,1);assert.match(r.stderr,/EXPLICIT_THREE_CALL_APPROVAL_REQUIRED/);
});
test('semantic trial cannot consume or mix an existing corpus',async()=>{
 const repo=new TransientRepository();await register(repo,fixture());
 await assert.rejects(runSemanticTrial(repo,mockSemanticProvider(),'mock'),/SEMANTIC_STORE_MUST_BE_EMPTY/);
 assert.equal((await repo.read()).usage.calls,0);
});

test('estimated cost preflight rejects a smaller budget before API access',()=>{
 const cost=semanticCostPreflight();assert.ok(cost.worstCaseInputCostUsd<=cost.maxEstimatedUsd);assert.equal(cost.estimateOnly,true);
 assert.throws(()=>semanticCostPreflight(0.0001),/SEMANTIC_ESTIMATED_COST_LIMIT/);
 assert.throws(()=>semanticCostPreflight(NaN),/SEMANTIC_ESTIMATED_COST_LIMIT/);
});
