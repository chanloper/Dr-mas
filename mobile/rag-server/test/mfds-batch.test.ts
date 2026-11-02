import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { batchPlan, batchStatus, runBatch, verifyBatch } from '../src/ingestion/batch.js';
import { LocalRepository } from '../src/repository.js';
import { collect } from '../src/ingestion/pipeline.js';
import { easyAdapter } from '../src/ingestion/mfds.js';
import { withRepo } from './helpers.js';
import { spawnSync } from 'node:child_process';

const env={DATA_GO_KR_SERVICE_KEY:'synthetic-batch-key-only'};
const row=(n:number):Record<string,unknown>=>({itemSeq:String(900000+n),itemName:`가상확대검증약${n}`,entpName:'합성업체',efcyQesitm:'<p>합성 효능 안내.</p>',useMethodQesitm:'가상 사용법',atpnWarnQesitm:null,atpnQesitm:'합성 주의 문장',intrcQesitm:null,seQesitm:'가상 부작용',depositMethodQesitm:'가상 보관법',openDe:'20200101',updateDe:'20261102',itemImage:`synthetic-image-${n}`});
const records=Array.from({length:50},(_,i)=>row(i));
const bytes=(items:Record<string,unknown>[],page:number,total=1000)=>new TextEncoder().encode(JSON.stringify({header:{resultCode:'00',resultMsg:'NORMAL SERVICE'},body:{pageNo:page,numOfRows:10,totalCount:total,items}}));
const fetcher=(source:Record<string,unknown>[],calls:number[],failPage?:number):typeof fetch=>async url=>{
  const u=new URL(String(url)),page=Number(u.searchParams.get('pageNo'));calls.push(page);
  assert.equal(u.searchParams.get('numOfRows'),'10');
  if(page===failPage)throw new Error('synthetic network failure');
  return new Response(bytes(source.slice((page-1)*10,page*10),page),{headers:{'content-type':'application/json;charset=utf-8'}});
};
async function inDirectory(fn:(directory:string)=>Promise<void>) {
  const directory=await mkdtemp(join(tmpdir(),'drmas-scale-'));try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}
}
test('20 rows stop after one page and resume with cross-page duplicate/null/missing audit',async()=>inDirectory(async directory=>{
  const source=structuredClone(records);source[10]={...source[9]!,itemImage:'synthetic-other-image'};delete source[2]!.intrcQesitm;
  const calls:number[]=[];const fetch=fetcher(source,calls);
  const a=await runBatch({directory,maxRows:20,pagesThisRun:1,approved:true,portalApproved:true,env,fetch});
  assert.equal(a.verification.rawRows,10);assert.equal(a.nextPage,2);assert.equal(a.scopeCompleted,false);
  const b=await runBatch({directory,maxRows:20,approved:true,portalApproved:true,env,fetch});
  assert.deepEqual(calls,[1,2]);assert.equal(b.verification.rawRows,20);assert.equal(b.verification.uniqueItems,19);assert.equal(b.verification.duplicateRows,1);
  assert.equal(b.ledger!.attempts,2);assert.equal(b.ledger!.maxAttempts,6);assert.equal(b.scopeCompleted,true);assert.equal(b.sourceExhausted,false);
  assert.deepEqual(b.verification.duplicates[0]!.rawRows,[10,11]);assert.deepEqual(b.verification.duplicates[0]!.differingFields,['itemImage']);
  assert.equal(b.verification.records[2]!.emptyFieldDetails.find(f=>f.sourceField==='intrcQesitm')!.rawStatus,'missing');
  assert.equal(b.verification.records[1]!.emptyFieldDetails.find(f=>f.sourceField==='intrcQesitm')!.rawStatus,'null');
  const report=JSON.parse(await readFile(join(directory,'verification-report.json'),'utf8'));
  assert.equal(report.rawPages.length,2);assert.equal(report.records[10].sourcePage,2);assert.equal(report.deletionStatus,'unverified');assert.equal(report.permission,'pending');
  await runBatch({directory,maxRows:20,approved:true,portalApproved:true,env,fetch});assert.deepEqual(calls,[1,2]);
}));
test('50-row scope survives a failed page and preserves cumulative attempts without refetching committed pages',async()=>inDirectory(async directory=>{
  const calls:number[]=[];
  await assert.rejects(runBatch({directory,maxRows:50,approved:true,portalApproved:true,env,fetch:fetcher(records,calls,3)}),/MFDS_NETWORK_ERROR/);
  const status=await batchStatus(50,directory);assert.equal(status.nextPage,3);assert.equal(status.ledger!.attempts,3);
  const result=await runBatch({directory,maxRows:50,approved:true,portalApproved:true,env,fetch:fetcher(records,calls)});
  assert.deepEqual(calls,[1,2,3,3,4,5]);assert.equal(result.verification.rawRows,50);assert.equal(result.verification.uniqueItems,50);
  assert.equal(result.ledger!.attempts,6);assert.equal(result.ledger!.attemptsByPage['3'],2);assert.equal(result.ledger!.maxAttempts,15);
  assert.equal(result.nextPage,6);assert.equal(result.scopeCompleted,true);
  await runBatch({directory,maxRows:50,approved:true,portalApproved:true,env,fetch:fetcher(records,calls)});assert.equal(calls.length,6);
  const rag=await new LocalRepository(join(directory,'rag')).read();assert.equal(Object.keys(rag.vectors).length,0);assert.equal(rag.usage.calls,0);
}));
test('page retry budget, deadline, changed scope and missing consent cannot be reset by resuming',async()=>inDirectory(async directory=>{
  let calls=0;const fetch:typeof globalThis.fetch=async()=>{calls++;return new Response('{}',{status:503});};
  const options={directory,maxRows:20,approved:true,portalApproved:true,env,fetch,policy:{maxAttempts:1}};
  for(let i=0;i<3;i++)await assert.rejects(runBatch(options),/MFDS_HTTP_5XX/);
  await assert.rejects(runBatch(options),/MFDS_BATCH_CALL_BUDGET/);assert.equal(calls,3);
  const control=new LocalRepository(join(directory,'control'));
  assert.equal((await control.read()).acquisition!.attempts,3);
  await assert.rejects(runBatch({...options,maxRows:50}),/MFDS_BATCH_CONFIG_CHANGED/);
  await control.transaction(s=>{s.acquisition!.deadlineAt=Date.now()-1;});
  await assert.rejects(runBatch(options),/MFDS_BATCH_DEADLINE/);
  await assert.rejects(runBatch({...options,approved:false}),/MFDS_SCOPE_APPROVAL_REQUIRED/);assert.equal(calls,3);
  assert.throws(()=>batchPlan(51),/MFDS_INVALID_ROW_LIMIT/);assert.throws(()=>batchPlan(25),/MFDS_INVALID_ROW_LIMIT/);
}));
test('completed scope flushes a durable RAG outbox without another HTTP request',async()=>inDirectory(async directory=>{
  const calls:number[]=[];const options={directory,maxRows:20,approved:true,portalApproved:true,env,fetch:fetcher(records,calls)};
  await runBatch(options);
  const store=new LocalRepository(join(directory,'ingestion')),rag=new LocalRepository(join(directory,'rag'));
  const id=Object.keys((await store.read()).ingestion!.medicines)[0]!;
  await store.transaction(s=>{s.ingestion!.pending[id]=true;});
  await rag.transaction(s=>{delete s.documents[id];for(const [key,c] of Object.entries(s.chunks))if(c.documentId===id)delete s.chunks[key];});
  await runBatch(options);assert.deepEqual(calls,[1,2]);assert.equal(Object.keys((await store.read()).ingestion!.pending).length,0);
  assert.equal((await verifyBatch(20,directory)).uniqueItems,20);
}));
test('incremental rescans preserve raw metadata variants and update only changed normalized medicines',async()=>withRepo(async store=>withRepo(async rag=>{
  const source=structuredClone(records.slice(0,20));
  const adapter=easyAdapter(async(page)=>bytes(source.slice((page-1)*10,page*10),page));
  await collect(store,rag,adapter,{jobId:'scan1',rows:10,maxPages:2,stopAfterPage:2});
  const a=await collect(store,rag,adapter,{jobId:'scan2',rows:10,maxPages:2,stopAfterPage:2});assert.equal(a.changed,0);
  source[0]!.efcyQesitm='변경된 합성 효능 문장';source[1]!.itemImage='synthetic-metadata-only';
  const b=await collect(store,rag,adapter,{jobId:'scan3',rows:10,maxPages:2,stopAfterPage:2});assert.equal(b.changed,1);
  const s=await store.read(),r=await rag.read();assert.equal(Object.keys(s.ingestion!.raw).length,3);
  assert.equal(r.documents['mfds-easy-900000']!.version,2);assert.equal(r.documents['mfds-easy-900001']!.version,1);
  assert.equal(Object.values(r.documents).filter(d=>d.version===2).length,1);
})));
test('source total drift fails audit and blocks further HTTP on resume',async()=>inDirectory(async directory=>{
  const calls:number[]=[];
  const fetch:typeof globalThis.fetch=async url=>{
    const page=Number(new URL(String(url)).searchParams.get('pageNo'));calls.push(page);
    return new Response(bytes(records.slice((page-1)*10,page*10),page,page===1?1000:1001));
  };
  const options={directory,maxRows:50,approved:true,portalApproved:true,env,fetch};
  await assert.rejects(runBatch(options),/MFDS_SOURCE_TOTAL_CHANGED/);assert.deepEqual(calls,[1,2]);
  await assert.rejects(runBatch(options),/MFDS_SOURCE_TOTAL_CHANGED/);assert.deepEqual(calls,[1,2]);
  assert.equal((await batchStatus(50,directory)).ledger!.attempts,2);
}));
test('batch CLI preflight and invalid/unapproved collection remain offline',()=>{
  const invoke=(args:string[])=>spawnSync(process.execPath,['--import','tsx','src/mfds-batch.ts',...args],{encoding:'utf8',env:{...process.env,DATA_GO_KR_SERVICE_KEY:''}});
  const p=invoke(['preflight','--max-rows=50']);assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).networkRequests,0);assert.equal(JSON.parse(p.stdout).maxAttempts,15);
  const a=invoke(['collect','--max-rows=20']);assert.equal(a.status,1);assert.match(a.stderr,/MFDS_SCOPE_APPROVAL_REQUIRED/);
  const b=invoke(['collect','--max-rows=50','--rows=100']);assert.equal(b.status,1);assert.match(b.stderr,/MFDS_INVALID_ARGUMENTS/);
});
