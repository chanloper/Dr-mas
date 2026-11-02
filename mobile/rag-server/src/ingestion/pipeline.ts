import { hash, validateDocument } from '../model.js';
import { register, type Repository } from '../repository.js';
import { decodeUtf8 } from '../encoding.js';
import { medicineDocument, medicineHash, type Medicine, type SourceAdapter } from './mfds.js';

export interface IngestionState {
  raw:Record<string,{source:string;pageNo:number;collectedAt:string;payload:string}>;
  medicines:Record<string,{value:Medicine;hash:string;version:number;lastSeenAt:string}>;
  jobs:Record<string,{source:string;revision:string;rows:number;nextPage:number;done:boolean}>;
  pending:Record<string,true>;
}
const empty=():IngestionState=>({raw:{},medicines:{},jobs:{},pending:{}});
export interface RunOptions { jobId:string; rows?:number; maxPages?:number; stopAfterPage?:number; signal?:AbortSignal; now?:()=>string; onPage?:()=>Promise<void> }
/** Distinct stores: durable page/checkpoint/outbox commits, then idempotent RAG delivery.
 * Job ID binds filters and source snapshot. A new ID performs an incremental full rescan.
 */
export async function collect(store:Repository,rag:Repository,adapter:SourceAdapter,options:RunOptions) {
  if(store===rag)throw new Error('SEPARATE_INGESTION_STORE_REQUIRED');
  const {jobId,rows=100,maxPages=1,signal,now=()=>new Date().toISOString()}=options;
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)||Object.hasOwn(Object.prototype,jobId)||!Number.isInteger(rows)||rows<1||rows>100||!Number.isInteger(maxPages)||maxPages<1||maxPages>1000)throw new Error('INVALID_JOB');
  if(options.stopAfterPage!==undefined&&(!Number.isInteger(options.stopAfterPage)||options.stopAfterPage<1||options.stopAfterPage>99999))throw new Error('INVALID_JOB');
  const flush=async()=>store.transaction(async s=>{
    const ingestion=s.ingestion??=empty();
    for(const id of Object.keys(ingestion.pending)) {
      signal?.throwIfAborted();
      await register(rag,medicineDocument(ingestion.medicines[id]!.value));
      delete ingestion.pending[id];
    }
  });
  await flush();
  let pages=0,changed=0,unchanged=0;
  while(pages<maxPages) {
    signal?.throwIfAborted();
    const result=await store.transaction(async s=>{
      const ingestion=s.ingestion??=empty();
      const job=ingestion.jobs[jobId]??={source:adapter.id,revision:adapter.revision,rows,nextPage:1,done:false};
      if(job.source!==adapter.id||job.revision!==adapter.revision||job.rows!==rows)throw new Error('JOB_CONFIG_CHANGED');
      if(job.done||(options.stopAfterPage!==undefined&&job.nextPage>options.stopAfterPage))return null;
      const pageNo=job.nextPage;
      let bytes:Uint8Array;
      try{bytes=await adapter.load(pageNo,rows);}catch{throw new Error('SOURCE_LOAD_FAILED');}
      signal?.throwIfAborted();
      const page=adapter.parse(bytes);
      if(page.pageNo!==pageNo||page.numOfRows!==rows)throw new Error('PAGE_MISMATCH');
      if(!page.items.length&&(pageNo-1)*rows<page.totalCount)throw new Error('PREMATURE_EMPTY_PAGE');
      const expected=Math.max(0,Math.min(rows,page.totalCount-(pageNo-1)*rows));
      if(page.items.length!==expected)throw new Error('INCONSISTENT_PAGE_COUNT');
      const collectedAt=now();
      if(!Number.isFinite(Date.parse(collectedAt)))throw new Error('INVALID_COLLECTION_DATE');
      const payload=decodeUtf8(bytes);
      // Content addressed raw snapshots retain unknown fields and source dates verbatim.
      const rawId=hash(`${adapter.id}:${pageNo}:${payload}`);
      ingestion.raw[rawId]??={source:adapter.id,pageNo,collectedAt,payload};
      let changed=0,unchanged=0;
      const seen=new Map<string,string>();
      for(const item of page.items) {
        const value=adapter.transform(item,collectedAt),digest=medicineHash(value);
        if(value.source!==adapter.id)throw new Error('SOURCE_MISMATCH');
        // Validate the generated document before committing a resumable checkpoint.
        validateDocument(medicineDocument(value));
        if(seen.has(value.id)&&seen.get(value.id)!==digest)throw new Error('CONFLICTING_DUPLICATE_ITEM');
        seen.set(value.id,digest);
        const old=ingestion.medicines[value.id];
        if(old?.hash===digest) {old.lastSeenAt=collectedAt;unchanged++;continue;}
        ingestion.medicines[value.id]={value,hash:digest,version:(old?.version??0)+1,lastSeenAt:collectedAt};
        ingestion.pending[value.id]=true;changed++;
      }
      job.nextPage++;job.done=pageNo*rows>=page.totalCount;
      return {changed,unchanged};
    });
    if(!result)break;
    pages++;changed+=result.changed;unchanged+=result.unchanged;
    await flush();
    await options.onPage?.();
  }
  const job=(await store.read()).ingestion?.jobs[jobId];
  return {pages,changed,unchanged,nextPage:job?.nextPage??1,done:job?.done??false};
}
/** Exact structured lookup is independent of RAG ranking or embeddings. */
export async function lookupMedicines(store:Repository,query:{itemId?:string;name?:string;ingredient?:string;offset?:number;limit?:number}) {
  const {offset=0,limit=20}=query;
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100||![query.itemId,query.name,query.ingredient].some(x=>x?.trim()))throw new Error('INVALID_LOOKUP');
  const records=Object.values((await store.read()).ingestion?.medicines??{}).map(x=>x.value).filter(m=>
    (query.itemId===undefined||m.itemId===query.itemId)&&
    (query.name===undefined||m.name.normalize('NFC')===query.name.normalize('NFC'))&&
    (query.ingredient===undefined||m.ingredient?.normalize('NFC')===query.ingredient.normalize('NFC'))
  ).sort((a,b)=>a.id.localeCompare(b.id));
  return {total:records.length,items:records.slice(offset,offset+limit)};
}
