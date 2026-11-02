import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { SearchIndex } from '../src/search.js';
import { hash, splitDocument } from '../src/model.js';
import { fixture, withRepo } from './helpers.js';
test('1000 synthetic documents persist and 100 exact-marker searches succeed',async t=>withRepo(async repo=>{
 const begin=performance.now();
 await repo.transaction(s=>{for(let i=0;i<1000;i++){
   const marker=`자료번호${String(i).padStart(6,'0')}`;
   const input=fixture(`scale-${i}`,`${marker} 가상 문서입니다. 성능 검증 전용 데이터이며 의료정보가 아닙니다.`);
   const d={...input,version:1,contentHash:hash(input.content)};s.documents[d.id]=d;
   for(const c of splitDocument(d))s.chunks[c.id]=c;
 }});
 const persistMs=performance.now()-begin;const state=await repo.read();const buildStart=performance.now();const index=new SearchIndex(state);const buildMs=performance.now()-buildStart;
 const latencies:number[]=[];
 for(let i=0;i<100;i++){const start=performance.now();const result=index.search(`자료번호${String(i*9).padStart(6,'0')}`);latencies.push(performance.now()-start);assert.equal(result.hits[0]?.documentId,`scale-${i*9}`);}
 latencies.sort((a,b)=>a-b);
 t.diagnostic(JSON.stringify({documents:1000,chunks:Object.keys(state.chunks).length,persistMs:Math.round(persistMs),buildMs:Math.round(buildMs),searchP95Ms:latencies[94],scope:'synthetic keyword only; no embedding throughput measurement'}));
 assert.equal(Object.keys(state.documents).length,1000);
}));
test('cross-process writer lock prevents conflicting writes',async()=>withRepo(async repo=>{
 let release:()=>void=()=>{};let entered:()=>void=()=>{};
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const first=repo.transaction(async()=>{entered();await gate;});await started;
 try{await assert.rejects(repo.transaction(()=>{}),/STORE_BUSY/);}finally{release();await first;}
 assert.equal((await repo.read()).schema,1);
}));
