// Offline review only: no environment loading, TOKEN, network or model SDK.
import { readFile, writeFile, realpath, mkdtemp } from 'node:fs/promises';
import { join, resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { kdcaCatalog, kdcaTermsUrl } from './kdca-catalog.js';
import { parseKdcaXml, kdcaDocument } from './kdca-healthinfo.js';
import { hash } from './model.js';
import { LocalRepository, register } from './repository.js';
import { previewRegistration, executeRegistration } from './registration.js';
import { kdcaUseAllowed, type KdcaUseReview } from './kdca-use.js';

const live=fileURLToPath(new URL('../data/local/',import.meta.url));
const testMarker='drmas-kdca-registration-test-v1';
export type KdcaReviewMode='synthetic'|'official';
async function canonical(path:string):Promise<string>{
  try{return await realpath(path);}catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    const parent=dirname(resolve(path));if(parent===resolve(path))throw error;
    return join(await canonical(parent),basename(path));
  }
}
function inside(parent:string,child:string){const delta=relative(parent,child);return !delta||delta!=='..'&&!delta.startsWith('..'+sep)&&!isAbsolute(delta);}
export async function createKdcaTestTarget(parent:string){
  const actual=await realpath(parent),production=await canonical(live);
  if(inside(production,actual))throw Error('KDCA_SYNTHETIC_LIVE_FORBIDDEN');
  const directory=await mkdtemp(join(actual,'kdca-test-target-'));
  await writeFile(join(directory,'workspace.json'),JSON.stringify({marker:testMarker}),{flag:'wx',mode:0o600});
  return directory;
}
async function sourceFor(staging:string,contentId:string,mode:KdcaReviewMode){
  if(!['synthetic','official'].includes(mode))throw Error('KDCA_REVIEW_MODE_REQUIRED');
  const entry=kdcaCatalog.find(item=>item.contentId===contentId);
  if(!entry)throw Error('KDCA_NOT_APPROVED');
  const workspace=JSON.parse(await readFile(join(staging,'workspace.json'),'utf8'));
  const intake=JSON.parse(await readFile(join(staging,'intake.json'),'utf8'));
  const checkpoint=JSON.parse(await readFile(join(staging,'checkpoint.json'),'utf8'));
  const item=checkpoint.items?.[contentId];
  if(workspace.marker!=='drmas-kdca-staging-v1'||intake.schema!==1||intake.contentId!==contentId||
    !['synthetic','unverified'].includes(intake.material)||!item||item.status!=='done'||
    !/^[a-f0-9]{64}$/.test(item.rawHash)||item.rawHash!==intake.rawHash||typeof item.collectedAt!=='string')throw Error('KDCA_INTAKE_INVALID');
  if(mode==='official'&&intake.material==='synthetic')throw Error('KDCA_SYNTHETIC_OFFICIAL_FORBIDDEN');
  const raw=await readFile(join(staging,'raw',item.rawHash+'.xml'),'utf8');
  if(hash(raw)!==item.rawHash)throw Error('KDCA_RAW_CHANGED');
  const input=kdcaDocument(parseKdcaXml(raw,entry,{offlineReview:true}),entry,item.collectedAt);
  const source=new LocalRepository(join(staging,'candidates')),state=await source.read();
  const document=state.documents[input.id];
  if(!document||Object.keys(state.documents).length!==1||!isDeepStrictEqual(document,{...input,contentHash:hash(input.content),version:1}))throw Error('KDCA_CANDIDATE_CHANGED');
  if(mode==='official')return {source,binding:{documentId:document.id,contentHash:document.contentHash,version:document.version},rawHash:item.rawHash as string};
  // Explicit synthetic identity and test-only grant prevent serving authored XML as official evidence.
  const synthetic={...input,id:'synthetic_kdca_'+contentId,publisher:'Dr.MAS 합성 테스트',
    sourceUrl:`https://example.org/synthetic-kdca/${contentId}`,attribution:{datasetName:'KDCA 형식 합성 테스트',
      datasetUrl:`https://example.org/synthetic-kdca/${contentId}`,itemCode:contentId,termsLabel:'테스트 작성 합성 자료',termsUrl:'https://example.org/synthetic-license'}};
  // An in-memory candidate avoids changing the staged XML or source repository.
  let memory=structuredClone(state);memory.documents={};memory.chunks={};memory.vectors={};
  const isolated={read:async()=>structuredClone(memory),transaction:async<T>(fn:(value:typeof memory)=>Promise<T>|T)=>{const draft=structuredClone(memory);const result=await fn(draft);memory=draft;return result;}};
  await register(isolated,synthetic);
  const created=memory.documents[synthetic.id]!;
  return {source:isolated,binding:{documentId:created.id,contentHash:created.contentHash,version:created.version},rawHash:item.rawHash as string};
}
export async function previewKdcaRegistration(staging:string,target:string,contentId:string,mode:KdcaReviewMode){
  const sourcePath=await canonical(staging),targetPath=await canonical(target),production=await canonical(live);
  if(inside(sourcePath,targetPath)||inside(targetPath,sourcePath))throw Error('KDCA_SEPARATE_STORES_REQUIRED');
  if(mode==='synthetic'){
    if(inside(production,targetPath)||inside(targetPath,production))throw Error('KDCA_SYNTHETIC_LIVE_FORBIDDEN');
    const workspace=JSON.parse(await readFile(join(targetPath,'workspace.json'),'utf8'));
    if(workspace.marker!==testMarker)throw Error('KDCA_TEST_TARGET_REQUIRED');
  }
  const candidate=await sourceFor(sourcePath,contentId,mode);
  const plan=await previewRegistration(candidate.source,new LocalRepository(targetPath),candidate.binding);
  const reviewTemplate:KdcaReview={material:mode,contentId,rawHash:candidate.rawHash,sourceFingerprint:plan.sourceFingerprint,
    destinationFingerprint:plan.destinationFingerprint,reviewer:'',reviewedAt:'',confirmed:false,
    localSearchConfirmed:false,quotationConfirmed:false,officialSourceConfirmed:false,
    evidenceUrl:mode==='official'?kdcaTermsUrl:'https://example.org/synthetic-license',externalGeneration:false,externalEmbedding:false};
  return {...plan,contentId,material:mode,rawHash:candidate.rawHash,
    officialEvidenceRequired:mode==='official',testOnly:mode==='synthetic',reviewTemplate};
}
export type KdcaReview={material:KdcaReviewMode;contentId:string;rawHash:string;sourceFingerprint:string;destinationFingerprint:string;
  reviewer:string;reviewedAt:string;confirmed:boolean;localSearchConfirmed:boolean;quotationConfirmed:boolean;
  officialSourceConfirmed:boolean;evidenceUrl:string;externalGeneration:false;externalEmbedding:false;publication?:KdcaUseReview};
export async function registerReviewedKdca(staging:string,target:string,review:KdcaReview){
  if(review.confirmed!==true||review.localSearchConfirmed!==true||review.quotationConfirmed!==true||
    review.externalGeneration!==false||review.externalEmbedding!==false||
    review.material==='official'&&(review.officialSourceConfirmed!==true||review.evidenceUrl!==kdcaTermsUrl)||
    review.material==='synthetic'&&review.evidenceUrl!=='https://example.org/synthetic-license')throw Error('KDCA_RIGHTS_REVIEW_REQUIRED');
  const plan=await previewKdcaRegistration(staging,target,review.contentId,review.material);
  if(plan.rawHash!==review.rawHash||plan.sourceFingerprint!==review.sourceFingerprint||plan.destinationFingerprint!==review.destinationFingerprint)throw Error('KDCA_REVIEW_CHANGED');
  const {source}=await sourceFor(await canonical(staging),review.contentId,review.material);
  if(review.material==='official'){
    const document=(await source.read()).documents[plan.target.documentId]!;
    if(!kdcaUseAllowed({...document,rights:{...document.rights,kdcaUse:review.publication}}))throw Error('KDCA_PUBLICATION_REVIEW_REQUIRED');
  }
  const result=await executeRegistration(source,new LocalRepository(await canonical(target)),plan,{confirmed:true,
    reviewer:review.reviewer,reviewedAt:review.reviewedAt,testOnly:review.material==='synthetic',
    ...(review.material==='official'?{kdcaUse:review.publication}:{})});
  return {...result,material:review.material,testOnly:review.material==='synthetic'};
}
