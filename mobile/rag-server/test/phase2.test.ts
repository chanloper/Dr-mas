import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/repository.js';
import { GeminiProvider, GuardedProvider, embeddingProfile, indexDocuments, defaultLimits, type Provider } from '../src/gemini.js';
import { SearchIndex, cosine } from '../src/search.js';
import { withRepo, fixture } from './helpers.js';
const vector=(first:number)=>Array.from({length:768},(_,i)=>i===first?1:0);
const provider:Provider={embed:async text=>vector(text.includes('알파')?0:1),select:async()=>'{"abstain":true,"claims":[]}'};
const limits={...defaultLimits,intervalMs:0};
function permitted(id='sample',text?:string){const d=fixture(id,text);d.rights.permission='permitted';return d;}
test('missing key is a clear configuration error',()=>assert.throws(()=>new GeminiProvider(''),/GEMINI_API_KEY_REQUIRED/));
test('cosine validates vectors and ranks semantic neighbours',()=>{
 assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);assert.throws(()=>cosine([1],[1,2]));assert.throws(()=>cosine([NaN],[1]));
});
test('indexing resumes, unchanged chunks skip, changed chunks reindex, cache reused',async()=>withRepo(async r=>{
 const api=new GuardedProvider(r,provider,limits);
 await register(r,permitted());await register(r,fixture('synthetic','절대 외부로 전송하지 않을 가상 내용'));
 assert.deepEqual(await indexDocuments(r,api),{indexed:1,skipped:1,total:2});
 assert.equal((await indexDocuments(r,api)).indexed,0);assert.equal((await r.read()).usage.calls,1);
 await register(r,permitted('sample','테스트성분베타 갱신 정보입니다.'));assert.equal((await indexDocuments(r,api)).indexed,1);
 await register(r,permitted());assert.equal((await indexDocuments(r,api)).indexed,1);assert.equal((await r.read()).usage.calls,2);
}));
test('hybrid search includes vector-only and lexical hits without duplicate chunks',async()=>withRepo(async r=>{
 await register(r,permitted());await register(r,permitted('beta','테스트성분베타 문서 내용입니다.'));
 await indexDocuments(r,new GuardedProvider(r,provider,limits));
 const result=new SearchIndex(await r.read()).search('알파',{minKeyword:0.2,minVector:0.8},{profile:embeddingProfile,values:vector(0)});
 assert.equal(result.hits[0]!.documentId,'sample');assert.equal(result.hits[0]!.vectorScore,1);
 assert.equal(new Set(result.hits.map(h=>h.chunkId)).size,result.hits.length);
 assert.equal(new SearchIndex(await r.read()).search('별개',{minVector:0.8},{profile:'incompatible',values:vector(0)}).status,'insufficient_evidence');
}));
test('persistent budgets count retries and reject before exceeding limit',async()=>withRepo(async r=>{
 let attempts=0;const flaky:Provider={...provider,embed:async()=>{attempts++;if(attempts===1)throw Object.assign(new Error('secret must not escape'),{status:429});return vector(0);}};
 const api=new GuardedProvider(r,flaky,{...limits,maxCalls:2});await api.embed('x','RETRIEVAL_QUERY');assert.equal(attempts,2);
 await assert.rejects(api.embed('x','RETRIEVAL_QUERY'),/USAGE_BUDGET_EXCEEDED/);assert.equal((await r.read()).usage.calls,2);
}));
test('timeout aborts signal and raw API errors are redacted',async()=>withRepo(async r=>{
 let aborted=false;const stuck:Provider={...provider,embed:async(_t,_task,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('private upstream error'));}))};
 await assert.rejects(new GuardedProvider(r,stuck,{...limits,timeoutMs:10}).embed('x','RETRIEVAL_QUERY'),/API_TIMEOUT/);assert.equal(aborted,true);
 await assert.rejects(new GuardedProvider(r,{...provider,embed:async()=>{throw new Error('private upstream error');}},limits).embed('x','RETRIEVAL_QUERY'),/^Error: API_CALL_FAILED$/);
}));
test('failed indexing retains successful checkpoint for restart',async()=>withRepo(async r=>{
 await register(r,permitted('a'));await register(r,permitted('b','테스트성분베타 정보'));
 let calls=0;const failing:Provider={...provider,embed:async()=>{if(++calls===2)throw new Error('failure');return vector(0);}};
 await assert.rejects(indexDocuments(r,new GuardedProvider(r,failing,limits)));
 assert.equal(Object.keys((await r.read()).vectors).length,1);
 assert.equal((await indexDocuments(r,new GuardedProvider(r,provider,limits))).indexed,1);
}));
