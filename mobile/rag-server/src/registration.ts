import {hash,validateDocument,type MedicalDocument,type State} from './model.js';
import {register,LocalRepository,type Repository} from './repository.js';
import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hasPermission} from './rights.js';
import {sourceAttribution} from './attribution.js';

export interface RegistrationBinding {documentId:string;version:number;contentHash:string}
export const mfdsRegistrationTarget:RegistrationBinding={documentId:'mfds-easy-195700020',version:1,contentHash:'453bf3c749d2c07a7334a93816a37f52004f9407db0041a0b2c89f4af959fd55'};
export const registrationPurpose='One reviewed public document: local keyword search and exact quotations only; no external AI transfer';
async function separateStores(source:Repository,target:Repository){
 if(source===target)throw Error('REGISTRATION_SEPARATE_STORES_REQUIRED');
 if(source instanceof LocalRepository&&target instanceof LocalRepository){
  const canonical=async(path:string)=>{try{return await realpath(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return resolve(path);throw error;}};
  if((await canonical(source.directory)).toLowerCase()===(await canonical(target.directory)).toLowerCase())throw Error('REGISTRATION_SEPARATE_STORES_REQUIRED');
 }
}
function checkedSource(state:State,binding:RegistrationBinding):MedicalDocument{
 const d=state.documents[binding.documentId];
 if(!d||d.id!==binding.documentId||d.version!==binding.version||d.contentHash!==binding.contentHash||hash(d.content)!==binding.contentHash)throw Error('REGISTRATION_SOURCE_CHANGED');
 validateDocument(d);
 if(d.rights.permission!=='pending'||Object.values(d.rights.scopes??{}).some(g=>g?.decision==='permitted'))throw Error('REGISTRATION_SOURCE_NOT_PENDING');
 return d;
}
function checkDestination(state:State,d:MedicalDocument){
 if(state.documents[d.id])throw Error('REGISTRATION_ALREADY_PRESENT');
 if(Object.values(state.documents).some(x=>x.contentHash===d.contentHash||x.sourceUrl===d.sourceUrl))throw Error('REGISTRATION_DUPLICATE');
}
export async function previewRegistration(source:Repository,target:Repository,binding:RegistrationBinding){
 await separateStores(source,target);
 const sourceState=await source.read(),state=await target.read();const d=checkedSource(sourceState,binding);
 if(binding.version!==1)throw Error('REGISTRATION_INITIAL_VERSION_REQUIRED');
 checkDestination(state,d);
 const attribution=sourceAttribution(d);if(!attribution)throw Error('REGISTRATION_ATTRIBUTION_REQUIRED');
 return {mode:'dry-run' as const,approved:false,writes:0,externalCalls:0,target:binding,
  documentsBefore:Object.keys(state.documents).length,documentsAfter:Object.keys(state.documents).length+1,documentIncrease:1,
  sourceFingerprint:hash(JSON.stringify(d)),destinationFingerprint:hash(JSON.stringify(state)),
  scopePreview:{local_search:'awaiting-final-approval',quotation:'awaiting-final-approval',external_embedding:'denied',external_generation:'denied'},
  reviewRequired:{evidenceUrl:attribution.termsUrl,reviewer:'required-at-execution',reviewedAt:'recorded-at-approved-execution',purpose:registrationPurpose},
  attribution:{publisher:d.publisher,...attribution,updatedAt:d.updatedAt},sourcePermissionUnchanged:d.rights.permission};
}
export type RegistrationPlan=Awaited<ReturnType<typeof previewRegistration>>;
export async function executeRegistration(source:Repository,target:Repository,plan:RegistrationPlan,approval:{confirmed:boolean;reviewer:string;reviewedAt:string}){
 if(approval.confirmed!==true||!approval.reviewer?.trim()||approval.reviewer.length>100||['APPROVED_REVIEWER_ROLE','required-at-execution','DRY_RUN_NOT_APPROVED'].includes(approval.reviewer)||!Number.isFinite(Date.parse(approval.reviewedAt)))throw Error('REGISTRATION_FINAL_APPROVAL_REQUIRED');
 await separateStores(source,target);
 const sourceState=await source.read();const d=checkedSource(sourceState,plan.target);
 if(hash(JSON.stringify(d))!==plan.sourceFingerprint)throw Error('REGISTRATION_SOURCE_CHANGED');
 const attribution=sourceAttribution(d);if(!attribution)throw Error('REGISTRATION_ATTRIBUTION_REQUIRED');
 // Reviewer records and the single new document are committed together by LocalRepository.
 return target.transaction(async state=>{
  if(hash(JSON.stringify(state))!==plan.destinationFingerprint)throw Error('REGISTRATION_DESTINATION_CHANGED');
  checkDestination(state,d);const before=structuredClone(state);
  const draft=structuredClone(state);
  const isolated:Repository={read:async()=>structuredClone(draft),transaction:async fn=>fn(draft)};
  const document=structuredClone(d);
  document.rights.scopes={};
  for(const scope of ['local_search','quotation','external_embedding','external_generation'] as const)document.rights.scopes[scope]={decision:scope==='local_search'||scope==='quotation'?'permitted':'denied',scope,evidenceUrl:attribution.termsUrl,
   reviewedAt:approval.reviewedAt,reviewer:approval.reviewer,documentId:d.id,documentVersion:d.version,contentHash:d.contentHash,purpose:registrationPurpose};
  const result=await register(isolated,document);
  const created=draft.documents[d.id];
  if(result.status!=='created'||!created||created.version!==plan.target.version||Object.keys(draft.documents).length!==Object.keys(before.documents).length+1
   ||!hasPermission(created,'local_search')||!hasPermission(created,'quotation')||hasPermission(created,'external_embedding')||hasPermission(created,'external_generation'))throw Error('REGISTRATION_POSTCONDITION_FAILED');
  for(const [id,old]of Object.entries(before.documents))if(JSON.stringify(draft.documents[id])!==JSON.stringify(old))throw Error('REGISTRATION_OTHER_DOCUMENT_CHANGED');
  for(const [id,old]of Object.entries(before.chunks))if(JSON.stringify(draft.chunks[id])!==JSON.stringify(old))throw Error('REGISTRATION_OTHER_CHUNK_CHANGED');
  if(JSON.stringify(before.usage)!==JSON.stringify(draft.usage)||JSON.stringify(before.vectors)!==JSON.stringify(draft.vectors))throw Error('REGISTRATION_EXTERNAL_STATE_CHANGED');
  Object.assign(state,draft);
  return {status:'registered',documentId:d.id,version:created.version,documentIncrease:1,externalCalls:0};
 });
}
