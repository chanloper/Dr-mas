import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRepo } from './helpers.js';
import { easyAdapter, easyRequest, parseEasy, transformEasy, cleanText, approvalAdapter } from '../src/ingestion/mfds.js';
import { collect, lookupMedicines } from '../src/ingestion/pipeline.js';
import { SearchIndex } from '../src/search.js';
import { indexDocuments, GuardedProvider, defaultLimits } from '../src/gemini.js';
import { answer } from '../src/answer.js';
import type { Repository } from '../src/repository.js';

// Entirely fictional medicines; no public API or Gemini calls.
const item=(id='1001')=>({itemSeq:id,itemName:`가상시험약${id}`,entpName:'가상업체',efcyQesitm:'<p>가상 효능 &amp; 안내</p>',useMethodQesitm:'가상 사용법',atpnWarnQesitm:'가상 경고',atpnQesitm:'가상 주의',intrcQesitm:'가상 상호작용',seQesitm:'가상 부작용',depositMethodQesitm:'가상 보관',openDe:'20200101',updateDe:'2026-11-02',unknownField:'원본 유지'});
const bytes=(items:unknown[],pageNo=1,totalCount=items.length,rows=2)=>new TextEncoder().encode(JSON.stringify({header:{resultCode:'00',resultMsg:'NORMAL SERVICE'},body:{items,pageNo,numOfRows:rows,totalCount}}));
const now=()=> '2026-11-02T00:00:00.000Z';
test('official request encodes decoded key and Korean exactly once; unknown spec stays blocked',()=>{
 const r=easyRequest(1,2,{itemName:'가상 한글&약'},{DATA_GO_KR_SERVICE_KEY:'fake+/='});
 assert.equal(r.method,'GET');assert.equal(r.url.searchParams.get('ServiceKey'),'fake+/=');
 assert.equal(r.url.searchParams.get('itemName'),'가상 한글&약');assert.equal(r.url.searchParams.get('type'),'json');
 assert.ok(r.url.href.includes('fake%2B%2F%3D'));
 assert.throws(()=>easyRequest(1,2,{},{}),/KEY_REQUIRED/);
 assert.throws(()=>easyRequest(0,2,{},{}),/INVALID_PAGING/);
 assert.throws(()=>approvalAdapter(),/OFFICIAL_APPROVAL_SPEC_REQUIRED/);
});
test('HTML and Korean integrity, null fields and source provenance survive transformation',()=>{
 const m=transformEasy(item(),now());assert.equal(m.efficacy,'가상 효능 & 안내');assert.equal(m.ingredient,null);
 assert.equal(m.updatedAt,'2026-11-02');assert.equal(m.publishedAt,'2020-01-01');assert.equal(m.itemId,'1001');
 assert.equal(m.publisher,'식품의약품안전처');assert.ok(m.sourceUrl.endsWith('#itemSeq=1001'));
 assert.equal(cleanText('<script>bad()</script><p>&#54620;&#xAE00;&nbsp;안내</p>'),'한글 안내');
 assert.throws(()=>cleanText('깨짐\uFFFD'),/ENCODING/);
 assert.throws(()=>transformEasy({...item(),updateDe:'20260230'},now()),/DATE/);
 assert.throws(()=>parseEasy(new Uint8Array([0xff])),/UTF8/);
 assert.throws(()=>parseEasy(new TextEncoder().encode('<xml>error</xml>')),/INVALID_API/);
 assert.throws(()=>parseEasy(new TextEncoder().encode('{"header":{"resultCode":"30","resultMsg":"secret"}}')),/^Error: MFDS_API_ERROR$/);
});
test('paged collection resumes, separates structured lookup and RAG, never embeds pending data',async()=>withRepo(async store=>withRepo(async rag=>{
 const loaded:number[]=[];
 const adapter=easyAdapter(async p=>{loaded.push(p);return bytes(p===1?[item('1001'),item('1002')]:[item('1003')],p,3);});
 let result=await collect(store,rag,adapter,{jobId:'first',rows:2,maxPages:1,now});
 assert.equal(result.nextPage,2);assert.equal(result.done,false);
 result=await collect(store,rag,adapter,{jobId:'first',rows:2,maxPages:1,now});
 assert.equal(result.done,true);assert.deepEqual(loaded,[1,2]);
 await collect(store,rag,adapter,{jobId:'first',rows:2,now});assert.deepEqual(loaded,[1,2]);
 const s=await store.read();assert.equal(Object.keys(s.documents).length,0);
 assert.equal(Object.keys(s.ingestion!.raw).length,2);assert.ok(Object.values(s.ingestion!.raw)[0]!.payload.includes('unknownField'));
 assert.equal((await lookupMedicines(store,{itemId:'1001'})).items[0]!.name,'가상시험약1001');
 assert.equal((await lookupMedicines(store,{ingredient:'추측성분'})).total,0);
 assert.equal(new SearchIndex(await rag.read()).search('가상시험약1001').status,'ok');
 let calls=0;const api=new GuardedProvider(rag,{embed:async()=>{calls++;return [];},select:async()=>{calls++;return '';}},{...defaultLimits,intervalMs:0});
 assert.equal((await indexDocuments(rag,api)).indexed,0);
 assert.equal((await answer(rag,'가상시험약1001',{api,publicQuestion:true})).status,'insufficient_evidence');assert.equal(calls,0);
})));
test('rescan deduplicates by identity/hash and increments changed medicine versions',async()=>withRepo(async store=>withRepo(async rag=>{
 let record=item();const adapter=easyAdapter(async()=>bytes([record,record]));
 await collect(store,rag,adapter,{jobId:'scan1',rows:2,now});
 const first=await rag.read();assert.equal(Object.keys(first.documents).length,1);
 await collect(store,rag,adapter,{jobId:'scan2',rows:2,now:()=> '2026-11-03T00:00:00Z'});
 assert.equal((await store.read()).ingestion!.medicines['mfds-easy-1001']!.version,1);
 assert.equal(Object.keys((await store.read()).ingestion!.raw).length,1);
 record={...record,seQesitm:'변경된 가상 부작용'};
 await collect(store,rag,adapter,{jobId:'scan3',rows:2,now});
 assert.equal((await store.read()).ingestion!.medicines['mfds-easy-1001']!.version,2);
 assert.equal((await rag.read()).documents['mfds-easy-1001']!.version,2);
 assert.equal(Object.keys((await store.read()).ingestion!.raw).length,2);
})));
test('RAG delivery failure retains outbox and restart delivers without refetching',async()=>withRepo(async store=>withRepo(async rag=>{
 let loads=0;const adapter=easyAdapter(async()=>{loads++;return bytes([item()]);});
 const broken:Repository={read:()=>rag.read(),transaction:async()=>{throw new Error('DISK_FAILURE');}};
 await assert.rejects(collect(store,broken,adapter,{jobId:'resume',rows:2,now}),/DISK_FAILURE/);
 assert.equal((await store.read()).ingestion!.jobs.resume!.nextPage,2);
 assert.equal(Object.keys((await store.read()).ingestion!.pending).length,1);
 await collect(store,rag,adapter,{jobId:'resume',rows:2,now});
 assert.equal(loads,1);assert.equal(Object.keys((await store.read()).ingestion!.pending).length,0);
 assert.equal(Object.keys((await rag.read()).documents).length,1);
})));
test('bad pages and transport errors never advance checkpoint or leak upstream errors',async()=>withRepo(async store=>withRepo(async rag=>{
 await assert.rejects(collect(store,rag,easyAdapter(async()=>{throw new Error('https://secret.invalid?ServiceKey=secret');}),{jobId:'bad',rows:2,now}),/^Error: SOURCE_LOAD_FAILED$/);
 assert.equal((await store.read()).ingestion?.jobs.bad,undefined);
 for(const data of [bytes([],1,4),bytes([item()],2,4),bytes([{...item(),itemSeq:null}]),bytes([item(),{...item(),seQesitm:'충돌'}])]) {
   await assert.rejects(collect(store,rag,easyAdapter(async()=>data),{jobId:'bad',rows:2,now}));
   assert.equal((await store.read()).ingestion?.jobs.bad,undefined);
 }
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(collect(store,rag,easyAdapter(async()=>bytes([])),{jobId:'bad',rows:2,signal:aborted.signal,now}));
})));
test('205 medicines process in bounded pages and resume the final page',async()=>withRepo(async store=>withRepo(async rag=>{
 const calls:number[]=[];
 const records=Array.from({length:205},(_,i)=>item(String(10000+i)));
 const adapter=easyAdapter(async(p,rows)=>{calls.push(p);return bytes(records.slice((p-1)*rows,p*rows),p,records.length,rows);});
 const first=await collect(store,rag,adapter,{jobId:'bounded',rows:100,maxPages:2,now});
 assert.equal(first.changed,200);assert.equal(first.done,false);assert.deepEqual(calls,[1,2]);
 const last=await collect(store,rag,adapter,{jobId:'bounded',rows:100,maxPages:1,now});
 assert.equal(last.changed,5);assert.equal(last.done,true);assert.deepEqual(calls,[1,2,3]);
 assert.equal(Object.keys((await rag.read()).documents).length,205);
 assert.equal((await lookupMedicines(store,{name:'가상시험약10204',limit:1})).total,1);
 await assert.rejects(collect(store,rag,adapter,{jobId:'bounded',rows:50,now}),/JOB_CONFIG_CHANGED/);
})));
