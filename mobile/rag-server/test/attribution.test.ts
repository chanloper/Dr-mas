import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceAttribution,mfdsDataset} from '../src/attribution.js';
import {fixture,reviewFixture,withRepo} from './helpers.js';
import {register} from '../src/repository.js';
import {localChat} from '../src/http-api.js';
import {validateDocument} from '../src/model.js';
test('synthetic MFDS-shaped record uses dataset citation, no invented detail URL, no scope approval',async()=>withRepo(async repo=>{
 const d=fixture('mfds-easy-990000001');d.publisher='식품의약품안전처';d.sourceUrl=mfdsDataset.datasetUrl+'#itemSeq=990000001';d.rights.permission='pending';delete d.rights.scopes;
 await register(repo,d);
 const stored=(await repo.read()).documents[d.id]!;const metadata=sourceAttribution(stored)!;
 assert.equal(metadata.itemCode,'990000001');assert.equal(metadata.datasetName,'의약품개요정보(e약은요)');assert.equal(metadata.verifiedDetailUrl,undefined);
 assert.equal((await localChat(repo,'테스트성분알파')).sources.length,0);
 assert.equal((await repo.read()).documents[d.id]!.rights.permission,'pending');
 // Only the synthetic fixture below receives explicitly authored local test reviews.
 reviewFixture(d);await register(repo,d);const result=await localChat(repo,'테스트성분알파');const source=result.sources[0]!;
 assert.equal(source.sourceUrl,mfdsDataset.datasetUrl);assert.equal(source.attribution?.itemCode,'990000001');assert.equal(source.attribution?.termsUrl,mfdsDataset.termsUrl);assert.equal(source.attribution?.verifiedDetailUrl,undefined);
 assert.equal((await repo.read()).usage.calls,0);
}));
test('wrong issuer or identifier cannot acquire MFDS attribution by URL alone',async()=>withRepo(async repo=>{
 const d=fixture('not-mfds');d.sourceUrl=mfdsDataset.datasetUrl;await register(repo,d);
 assert.equal(sourceAttribution((await repo.read()).documents[d.id]!),undefined);
}));
test('explicit attribution validates safe URLs and requires a detail verification date',()=>{
 const d=fixture();d.attribution={...mfdsDataset,itemCode:'990000001'};
 assert.doesNotThrow(()=>validateDocument(d));
 d.attribution.verifiedDetailUrl='https://example.org/synthetic-detail';assert.throws(()=>validateDocument(d),/INVALID_ATTRIBUTION/);
 d.attribution.detailVerifiedAt='2026-11-03';assert.doesNotThrow(()=>validateDocument(d));
 d.attribution.datasetUrl='javascript:alert(1)';assert.throws(()=>validateDocument(d),/INVALID_ATTRIBUTION/);
});
test('license metadata alone does not approve search or quotation',async()=>withRepo(async repo=>{
 const d=fixture();d.rights.permission='permitted';delete d.rights.scopes;
 d.attribution={datasetName:'Synthetic dataset',datasetUrl:'https://example.org/dataset',itemCode:'990000001',termsLabel:'Synthetic license label',termsUrl:'https://example.org/license'};
 await register(repo,d);
 assert.equal((await localChat(repo,'테스트성분알파')).sources.length,0);
 assert.deepEqual((await repo.read()).documents[d.id]!.rights.scopes,undefined);
 assert.equal((await repo.read()).usage.calls,0);
}));
