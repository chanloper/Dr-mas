import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {emptyState,hash} from '../src/model.js';
import {register,LocalRepository,type Repository} from '../src/repository.js';
import {previewRegistration,executeRegistration} from '../src/registration.js';
import {localChat} from '../src/http-api.js';
import {hasPermission} from '../src/rights.js';
import {GuardedProvider,indexDocuments,defaultLimits} from '../src/gemini.js';
import {fixture,withRepo} from './helpers.js';
function memory():Repository{let state=emptyState();return {read:async()=>structuredClone(state),transaction:async fn=>{const draft=structuredClone(state);const result=await fn(draft);state=draft;return result;}};}
function candidate(){
 const d=fixture('synthetic_target');d.rights.permission='pending';delete d.rights.scopes;
 d.attribution={datasetName:'Synthetic dataset',datasetUrl:'https://example.org/dataset',itemCode:'990000001',termsLabel:'Synthetic test license',termsUrl:'https://example.org/license'};
 return d;
}
const approval={confirmed:true,reviewer:'synthetic-test-reviewer',reviewedAt:'2026-11-03T00:00:00.000Z'};
async function setup(){const source=memory(),target=memory(),d=candidate();await register(source,d);return {source,target,d,binding:{documentId:d.id,version:1,contentHash:hash(d.content)}};}
test('dry-run is read-only, selects exactly one document and creates no approval or store',async()=>withRepo(async source=>{
 const d=candidate();await register(source,d);const before=JSON.stringify(await source.read());
 const target=new LocalRepository(join(source.directory,'nonexistent-target'));
 const plan=await previewRegistration(source,target,{documentId:d.id,version:1,contentHash:hash(d.content)});
 assert.equal(plan.approved,false);assert.equal(plan.documentIncrease,1);assert.equal(plan.writes,0);
 assert.equal(JSON.stringify(await source.read()),before);await assert.rejects(access(target.directory));
 await assert.rejects(executeRegistration(source,target,plan,{...approval,confirmed:false}),/FINAL_APPROVAL_REQUIRED/);
 await assert.rejects(access(target.directory));
}));
test('offline synthetic registration atomically grants only local scopes and preserves all nine source records',async()=>{
 const {source,target,d,binding}=await setup();
 for(let i=0;i<8;i++){const other=fixture('pending_'+i,'Synthetic marker '+i);other.rights.permission='pending';delete other.rights.scopes;await register(source,other);}
 const before=JSON.stringify(await source.read());
 assert.equal((await localChat(source,'테스트성분알파')).sources.length,0);
 const plan=await previewRegistration(source,target,binding);
 assert.equal((await executeRegistration(source,target,plan,approval)).documentIncrease,1);
 const result=await localChat(target,'테스트성분알파');assert.equal(result.status,'local_evidence');assert.equal(result.sources.length,1);
 assert.equal(result.sources[0]!.documentId,d.id);assert.equal(result.sources[0]!.attribution?.itemCode,'990000001');
 const state=await target.read(),doc=state.documents[d.id]!;
 assert.equal(Object.keys(state.documents).length,1);assert.equal(hasPermission(doc,'local_search'),true);assert.equal(hasPermission(doc,'quotation'),true);
 assert.equal(doc.rights.scopes!.external_embedding!.decision,'denied');assert.equal(doc.rights.scopes!.external_generation!.decision,'denied');
 assert.equal(doc.rights.scopes!.quotation!.reviewer,approval.reviewer);assert.equal(doc.rights.scopes!.quotation!.evidenceUrl,d.attribution!.termsUrl);
 assert.equal(JSON.stringify(await source.read()),before);
 let calls=0;const api=new GuardedProvider(target,{embed:async()=>{calls++;return [];},select:async()=>{calls++;return '';}},{...defaultLimits,intervalMs:0});
 assert.equal((await indexDocuments(target,api)).indexed,0);assert.equal(calls,0);
 await assert.rejects(previewRegistration(source,target,binding),/ALREADY_PRESENT/);
});
test('ID/version/hash mismatch and source-destination alias fail closed',async()=>{
 const {source,target,binding}=await setup();
 for(const wrong of [{...binding,documentId:'another'},{...binding,version:2},{...binding,contentHash:'0'.repeat(64)}])await assert.rejects(previewRegistration(source,target,wrong),/SOURCE_CHANGED/);
 await assert.rejects(previewRegistration(source,source,binding),/SEPARATE_STORES/);
 await withRepo(async disk=>{await register(disk,candidate());await assert.rejects(previewRegistration(disk,new LocalRepository(disk.directory),binding),/SEPARATE_STORES/);});
});
test('changed destination or source invalidates preview; missing reviewer cannot approve',async()=>{
 const {source,target,binding}=await setup();const plan=await previewRegistration(source,target,binding);
 await assert.rejects(executeRegistration(source,target,plan,{...approval,reviewer:''}),/FINAL_APPROVAL_REQUIRED/);
 await target.transaction(s=>{s.usage.calls++;});await assert.rejects(executeRegistration(source,target,plan,approval),/DESTINATION_CHANGED/);
 const next=await previewRegistration(source,target,binding);
 await source.transaction(s=>{s.documents[binding.documentId]!.updatedAt='2026-11-04';});await assert.rejects(executeRegistration(source,target,next,approval),/SOURCE_CHANGED/);
 assert.equal(Object.keys((await target.read()).documents).length,0);
});
test('existing destination data preserved and changed content needs fresh review after registration',async()=>{
 const {source,target,binding}=await setup();await register(target,fixture('existing','Existing synthetic marker.'));
 const old=(await target.read()).documents.existing;
 const plan=await previewRegistration(source,target,binding);await executeRegistration(source,target,plan,approval);
 assert.deepEqual((await target.read()).documents.existing,old);
 const doc=(await target.read()).documents[binding.documentId]!;
 await register(target,{...doc,content:doc.content+' Changed synthetic marker.'});
 assert.equal(hasPermission((await target.read()).documents[binding.documentId],'local_search'),false);
});
test('offline disk integration survives reload without modifying source or embedding data',async()=>withRepo(async source=>withRepo(async target=>{
 const d=candidate();await register(source,d);const original=JSON.stringify(await source.read());
 const plan=await previewRegistration(source,target,{documentId:d.id,version:1,contentHash:hash(d.content)});
 await executeRegistration(source,target,plan,approval);
 const restored=new LocalRepository(target.directory);assert.equal((await localChat(restored,'테스트성분알파')).sources.length,1);
 assert.equal(JSON.stringify(await source.read()),original);assert.equal(Object.keys((await restored.read()).vectors).length,0);
})));
