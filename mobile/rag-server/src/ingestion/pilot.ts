import { mkdir, open, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalRepository } from '../repository.js';
import { collect } from './pipeline.js';
import { createPilotHttpAdapter, MfdsError, pilotPolicy, safeMfdsCode, type HttpOptions } from './http.js';
import { writePilotVerification } from './verify.js';

export const pilotDirectory=fileURLToPath(new URL('../../data/mfds-pilot/',import.meta.url));
export function pilotPreflight(env:NodeJS.ProcessEnv=process.env) {
  return {mode:'preflight',networkRequests:0,keyConfigured:!!env.DATA_GO_KR_SERVICE_KEY?.trim(),portalApproval:'not_verified',keyValidity:'not_verified',
    maxItems:5,pageNo:1,maxPages:1,policy:pilotPolicy,permission:'pending',geminiEnabled:false};
}
function repos(directory:string) {
  return {store:new LocalRepository(join(directory,'ingestion')),rag:new LocalRepository(join(directory,'rag'))};
}
export async function verifyPilot(directory=pilotDirectory) {
  const {store,rag}=repos(directory);return writePilotVerification(store,rag,directory);
}
/** Permanent reservation before network, including failure/timeout. No automatic reset command. */
export async function runPilot(options:HttpOptions & {portalApproved?:boolean;directory?:string}={}) {
  if(options.approved!==true)throw new MfdsError('LIVE_MAX_5_APPROVAL_REQUIRED');
  if(options.portalApproved!==true)throw new MfdsError('PORTAL_APPROVAL_CONFIRMATION_REQUIRED');
  const adapter=createPilotHttpAdapter(options); // Key/config validation before touching disk.
  const directory=resolve(options.directory??pilotDirectory);
  await mkdir(directory,{recursive:true});
  let reservation;
  try{reservation=await open(join(directory,'reservation.json'),'wx',0o600);}
  catch{throw new MfdsError('MFDS_PILOT_ALREADY_RESERVED_OR_UNWRITABLE');}
  try {
    await reservation.writeFile(JSON.stringify({reservedAt:new Date().toISOString(),maxItems:5,maxAttempts:pilotPolicy.maxAttempts,portalApprovalConfirmed:true,explicitApproval:true,permission:'pending'}),'utf8');
    await reservation.sync();
  }finally{await reservation.close();}
  const {store,rag}=repos(directory);
  let transportFailure:unknown;
  const guarded={...adapter,load:async(page:number,rows:number)=>{
    try{return await adapter.load(page,rows);}catch(error){transportFailure=error;throw error;}
  }};
  try {
    const existing=await store.read(),existingRag=await rag.read();
    if(existing.ingestion||Object.keys(existing.documents).length||Object.keys(existingRag.documents).length||Object.keys(existingRag.chunks).length||Object.keys(existingRag.vectors).length||existingRag.usage.calls)throw new MfdsError('MFDS_PILOT_STORE_NOT_EMPTY');
    await collect(store,rag,guarded,{jobId:'first-live-max-5',rows:5,maxPages:1,signal:options.signal});
    const verification=await writePilotVerification(store,rag,directory);
    const result={status:'pilot_completed',apiAccess:'confirmed_at_request_time',attempts:adapter.attempts(),scopeCompleted:true,sourceExhausted:verification.sourceTotal<=5,verification};
    await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2),{encoding:'utf8',mode:0o600});
    return result;
  } catch(error) {
    const code=safeMfdsCode(transportFailure??error);
    await writeFile(join(directory,'failure.json'),JSON.stringify({status:'failed',code,attempts:adapter.attempts(),reservationRetained:true}),{encoding:'utf8',mode:0o600}).catch(()=>{});
    throw new MfdsError(code);
  }
}
