import {createHash} from 'node:crypto';
import type {DocumentInput,MedicalDocument,Chunk} from './model.js';
import { isKdcaDocument } from './kdca-use.js';
export const permissionScopes=['local_search','quotation','external_embedding','external_generation'] as const;
export type PermissionScope=typeof permissionScopes[number];
export interface PermissionDecision {
 decision:'pending'|'denied'|'permitted';
 evidenceUrl?:string;reviewedAt?:string;reviewer?:string;
 documentId?:string;documentVersion?:number;contentHash?:string;
 scope?:PermissionScope;purpose?:string;
}
export type ScopeDecisions=Partial<Record<PermissionScope,PermissionDecision>>;
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function complete(g:PermissionDecision,key:PermissionScope){
 try{const url=new URL(g.evidenceUrl??'');return url.protocol==='https:'&&!url.username&&!url.password
  &&typeof g.reviewedAt==='string'&&Number.isFinite(Date.parse(g.reviewedAt))
  &&!!g.reviewer?.trim()&&!!g.purpose?.trim()&&!!g.documentId?.trim()
  &&Number.isInteger(g.documentVersion)&&(g.documentVersion??0)>0&&/^[a-f0-9]{64}$/.test(g.contentHash??'')&&g.scope===key;}catch{return false;}
}
export function validateScopes(value:unknown){
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RIGHTS_SCOPES');
 for(const [key,g]of Object.entries(value)){
  if(!permissionScopes.includes(key as PermissionScope)||!g||typeof g!=='object'||Array.isArray(g)||!['pending','denied','permitted'].includes(g.decision))throw Error('INVALID_RIGHTS_SCOPES');
  if(g.decision==='permitted'&&!complete(g,key as PermissionScope))throw Error('INCOMPLETE_RIGHTS_REVIEW');
 }
}
export function hasPermission(doc:MedicalDocument|undefined,scope:PermissionScope):boolean {
 if(!doc)return false;
 if(isKdcaDocument(doc) && (scope==='external_embedding'||scope==='external_generation'))return false;
 const g=doc.rights.scopes?.[scope];
 return !!g&&g.decision==='permitted'&&complete(g,scope)&&g.documentId===doc.id
  &&g.documentVersion===doc.version&&g.contentHash===doc.contentHash&&g.contentHash===digest(doc.content);
}
export function hasChunkPermission(doc:MedicalDocument|undefined,chunk:Chunk|undefined,scope:PermissionScope):boolean {
 return !!doc&&!!chunk&&hasPermission(doc,scope)&&chunk.documentId===doc.id&&chunk.version===doc.version
  &&chunk.text===doc.content.slice(chunk.start,chunk.end)&&chunk.contentHash===digest(chunk.text);
}
// Registration never infers grants from legacy permission or an old document.
export function bindRights(input:DocumentInput,version:number){
 const rights=structuredClone(input.rights);
 for(const g of Object.values(rights.scopes??{}))if(g?.decision==='permitted'
  &&(g.documentId!==input.id||g.documentVersion!==version||g.contentHash!==digest(input.content)))g.decision='pending';
 return rights;
}
