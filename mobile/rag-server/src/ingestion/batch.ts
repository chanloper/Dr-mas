import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalRepository } from '../repository.js';
import { collect } from './pipeline.js';
import { createLimitedHttpAdapter, MfdsError, pilotPolicy, safeMfdsCode, type HttpOptions } from './http.js';
import { inspectCollectionSnapshot, writePilotVerification } from './verify.js';

export interface BatchControl {
  maxRows:number;pageSize:10;maxPages:number;maxAttempts:number;
  attempts:number;attemptsByPage:Record<string,number>;lastAttemptAt:number;
  startedAt:number;deadlineAt:number;
}
const jobId='bounded-scale-v1';
export function batchPlan(maxRows:number) {
  if(![20,30,40,50].includes(maxRows))throw new MfdsError('MFDS_INVALID_ROW_LIMIT');
  return {maxRows,pageSize:10 as const,maxPages:maxRows/10,maxAttempts:maxRows/10*3,windowMs:15*60*1000,policy:pilotPolicy};
}
export function batchDirectory(maxRows:number) {
  batchPlan(maxRows);return fileURLToPath(new URL(`../../data/mfds-scale-${maxRows}/`,import.meta.url));
}
function repositories(directory:string) {
  return {control:new LocalRepository(join(directory,'control')),store:new LocalRepository(join(directory,'ingestion')),rag:new LocalRepository(join(directory,'rag'))};
}
export async function batchStatus(maxRows:number,directory=batchDirectory(maxRows)) {
  const plan=batchPlan(maxRows),{control,store}=repositories(directory);
  const ledger=(await control.read()).acquisition;
  const job=(await store.read()).ingestion?.jobs[jobId];
  return {plan,ledger:ledger??null,nextPage:job?.nextPage??1,sourceExhausted:job?.done??false,scopeCompleted:!!job&&(job.done||job.nextPage>plan.maxPages),deletionStatus:'unverified',permission:'pending',geminiEnabled:false};
}
export async function verifyBatch(maxRows:number,directory=batchDirectory(maxRows)) {
  const plan=batchPlan(maxRows),{store,rag}=repositories(directory);
  return writePilotVerification(store,rag,directory,plan);
}
export interface BatchOptions extends HttpOptions {maxRows:number;portalApproved?:boolean;directory?:string;pagesThisRun?:number}
/** Independent approval scope. Budgets survive errors, resumes and failed requests.
 * Each new limit uses its own local directory; no migration/deletion of the five-row pilot.
 */
export async function runBatch(options:BatchOptions) {
  const plan=batchPlan(options.maxRows);
  if(options.approved!==true)throw new MfdsError('MFDS_SCOPE_APPROVAL_REQUIRED');
  if(options.portalApproved!==true)throw new MfdsError('PORTAL_APPROVAL_CONFIRMATION_REQUIRED');
  const pagesThisRun=options.pagesThisRun??plan.maxPages;
  if(!Number.isInteger(pagesThisRun)||pagesThisRun<1||pagesThisRun>plan.maxPages)throw new MfdsError('MFDS_INVALID_PAGE_LIMIT');
  if(!(options.env??process.env).DATA_GO_KR_SERVICE_KEY?.trim())throw new MfdsError('DATA_GO_KR_SERVICE_KEY_REQUIRED');
  const directory=options.directory??batchDirectory(options.maxRows);
  const {control,store,rag}=repositories(directory);
  await mkdir(directory,{recursive:true});
  const lockPath=join(directory,'run.lock');
  let lock;
  try{lock=await open(lockPath,'wx');}catch{throw new MfdsError('MFDS_BATCH_BUSY_OR_STALE_LOCK');}
  let transportFailure:unknown;
  try {
    const ledger=await control.transaction(s=>{
      s.acquisition??={maxRows:plan.maxRows,pageSize:10,maxPages:plan.maxPages,maxAttempts:plan.maxAttempts,attempts:0,attemptsByPage:{},lastAttemptAt:0,startedAt:Date.now(),deadlineAt:Date.now()+plan.windowMs};
      const a=s.acquisition;
      if(a.maxRows!==plan.maxRows||a.pageSize!==10||a.maxPages!==plan.maxPages||a.maxAttempts!==plan.maxAttempts)throw new MfdsError('MFDS_BATCH_CONFIG_CHANGED');
      return structuredClone(a);
    });
    const remaining=ledger.deadlineAt-Date.now();
    if(remaining<=0)throw new MfdsError('MFDS_BATCH_DEADLINE');
    const signal=AbortSignal.any([AbortSignal.timeout(remaining),...(options.signal?[options.signal]:[])]);
    const adapter=createLimitedHttpAdapter({...options,signal},{maxPage:plan.maxPages,pageSize:10,
      beforeAttempt:async page=>{
        const existing=await store.read();
        if(existing.ingestion&&Object.keys(existing.ingestion.raw).length)await inspectCollectionSnapshot(store,rag,plan);
        return control.transaction(s=>{
        const a=s.acquisition!;
        const notBefore=Math.max(Date.now(),a.lastAttemptAt+pilotPolicy.intervalMs);
        if(notBefore>=a.deadlineAt)throw new MfdsError('MFDS_BATCH_DEADLINE');
        if(a.attempts>=a.maxAttempts||(a.attemptsByPage[page]??0)>=3)throw new MfdsError('MFDS_BATCH_CALL_BUDGET');
        a.attempts++;a.attemptsByPage[page]=(a.attemptsByPage[page]??0)+1;a.lastAttemptAt=notBefore;
        return notBefore;
        });
      },
      afterAttempt:()=>control.transaction(s=>{s.acquisition!.lastAttemptAt=Math.max(s.acquisition!.lastAttemptAt,Date.now());})
    });
    const guarded={...adapter,load:async(page:number,rows:number)=>{
      try{return await adapter.load(page,rows);}catch(error){transportFailure=error;throw error;}
    }};
    // Always flush a pending RAG outbox, even after the final page was checkpointed.
    await collect(store,rag,guarded,{jobId,rows:10,maxPages:pagesThisRun,stopAfterPage:plan.maxPages,signal,
      onPage:async()=>{await writePilotVerification(store,rag,directory,plan);}});
    const verification=await writePilotVerification(store,rag,directory,plan);
    const status=await batchStatus(options.maxRows,directory);
    const result={status:status.scopeCompleted?'scope_completed':'paused_at_page_boundary',...status,verification};
    await writeFile(join(directory,'batch-result.json'),JSON.stringify(result,null,2),{encoding:'utf8',mode:0o600});
    return result;
  } catch(error) {
    const code=safeMfdsCode(transportFailure??error);
    await writeFile(join(directory,'batch-failure.json'),JSON.stringify({code,...await batchStatus(options.maxRows,directory)}),{encoding:'utf8',mode:0o600}).catch(()=>{});
    throw new MfdsError(code);
  }finally {await lock.close();await unlink(lockPath);}
}
