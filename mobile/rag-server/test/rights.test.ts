import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,hash,validateDocument,type State} from '../src/model.js';
import {permissionScopes,hasPermission} from '../src/rights.js';
import {register,type Repository} from '../src/repository.js';
import {SearchIndex} from '../src/search.js';
import {localChat} from '../src/http-api.js';
import {answer} from '../src/answer.js';
import {GuardedProvider,indexDocuments,defaultLimits,type Provider} from '../src/gemini.js';
import {fixture,reviewFixture} from './helpers.js';
function memory(){let state=emptyState();return {read:async()=>structuredClone(state),transaction:async<T>(fn:(s:State)=>T|Promise<T>)=>{const next=structuredClone(state);const r=await fn(next);state=next;return r;}} satisfies Repository;}
for(let mask=0;mask<16;mask++)test(`four independent rights combination ${mask}`,async()=>{
 const scopes=permissionScopes.filter((_,i)=>mask&(1<<i));const repo=memory();
 const d=reviewFixture(fixture(),scopes);d.rights.permission='permitted';await register(repo,d);
 const doc=(await repo.read()).documents[d.id]!;
 permissionScopes.forEach((scope,i)=>assert.equal(hasPermission(doc,scope),!!(mask&(1<<i))));
 const search=new SearchIndex(await repo.read()).search('테스트성분알파');
 assert.equal(search.hits.length,mask&1?1:0);
 if(search.hits.length)assert.equal(search.hits[0]!.text,mask&2?d.content:'');
 assert.equal((await localChat(repo,'테스트성분알파')).sources.length,(mask&3)===3?1:0);
 const sent:string[]=[];
 const provider:Provider={embed:async text=>{sent.push(text);return [1,0];},select:async prompt=>{sent.push(prompt);return JSON.stringify({abstain:false,claims:[{chunkId:'sample:1:0',quote:d.content}]});}};
 const api=new GuardedProvider(repo,provider,{...defaultLimits,attempts:1,intervalMs:0});
 await indexDocuments(repo,api);
 assert.equal(sent.includes(d.content),!!(mask&4));sent.length=0;
 const result=await answer(repo,'테스트성분알파',{api,publicQuestion:true});
 const generationAllowed=(mask&11)===11;
 assert.equal(sent.some(text=>text.includes('untrustedEvidence')),generationAllowed);
 assert.equal(result.status,generationAllowed?'grounded_quotes':'insufficient_evidence');
 if(!generationAllowed)assert.equal(sent.length,0);
});
test('legacy permitted never grants any scope; pending HTTP and old embedding allowlist remain denied',async()=>{
 const repo=memory();const d=fixture();delete d.rights.scopes;d.rights.permission='permitted';await register(repo,d);
 for(const scope of permissionScopes)assert.equal(hasPermission((await repo.read()).documents[d.id],scope),false);
 assert.equal((await localChat(repo,'테스트성분알파')).sources.length,0);
 let calls=0;const api=new GuardedProvider(repo,{embed:async()=>{calls++;return [1,0];},select:async()=>{calls++;return '';}},{...defaultLimits,intervalMs:0});
 await indexDocuments(repo,api,16,{syntheticTestDocuments:new Map([[d.id,hash(d.content)]])});
 await answer(repo,'테스트성분알파',{api,publicQuestion:true});assert.equal(calls,0);
 d.rights.permission='pending';await register(repo,d);assert.equal(new SearchIndex(await repo.read()).search('테스트성분알파').hits.length,0);
});
test('registration validates evidence metadata; changed content invalidates all previous reviews',async()=>{
 const repo=memory();const d=reviewFixture(fixture(),[...permissionScopes]);d.rights.permission='permitted';await register(repo,d);
 const invalid=structuredClone(d);delete invalid.rights.scopes!.local_search!.reviewer;
 assert.throws(()=>validateDocument(invalid),/INCOMPLETE_RIGHTS_REVIEW/);
 const before=await repo.read();assert.equal(hasPermission(before.documents.sample,'local_search'),true);
 const changed={...d,content:d.content+' 추가된 합성 표식.'};await register(repo,changed);
 const after=(await repo.read()).documents.sample!;assert.equal(after.version,2);
 for(const scope of permissionScopes){assert.equal(hasPermission(after,scope),false);assert.equal(after.rights.scopes![scope]!.decision,'pending');}
 reviewFixture(changed,['local_search','quotation'],2);await register(repo,changed);
 assert.equal(hasPermission((await repo.read()).documents.sample,'local_search'),true);
 assert.equal(hasPermission((await repo.read()).documents.sample,'external_generation'),false);
});
test('denied scope overrides stale vectors and explicit synthetic allowlist cannot grant external rights',async()=>{
 const repo=memory(),d=fixture();await register(repo,d);
 let calls=0;await indexDocuments(repo,new GuardedProvider(repo,{embed:async()=>{calls++;return [1];},select:async()=>''},{...defaultLimits,intervalMs:0}),16,{syntheticTestDocuments:new Map([[d.id,hash(d.content)]])});
 assert.equal(calls,0);
 await repo.transaction(s=>{s.documents.sample!.rights.scopes!.local_search={decision:'denied'};s.vectors['sample:1:0']={profile:'test',values:[1]};});
 assert.equal(new SearchIndex(await repo.read()).search('테스트성분알파',{}, {profile:'test',values:[1]}).hits.length,0);
});
test('altered chunk cannot be embedded or returned despite a reviewed document',async()=>{
 const repo=memory(),d=reviewFixture(fixture(),[...permissionScopes]);d.rights.permission='permitted';await register(repo,d);
 await repo.transaction(s=>{s.chunks['sample:1:0']!.text='unapproved synthetic text';});
 let calls=0;const api=new GuardedProvider(repo,{embed:async()=>{calls++;return [1];},select:async()=>{calls++;return '';}},{...defaultLimits,intervalMs:0});
 assert.equal((await indexDocuments(repo,api)).indexed,0);
 assert.equal((await localChat(repo,'테스트성분알파')).sources.length,0);assert.equal(calls,0);
});
test('revocation during generation prevents returning quoted text',async()=>{
 const repo=memory(),d=reviewFixture(fixture(),['local_search','quotation','external_generation']);d.rights.permission='permitted';await register(repo,d);
 const api=new GuardedProvider(repo,{embed:async()=>[1],select:async()=>{await repo.transaction(s=>{s.documents.sample!.rights.scopes!.quotation={decision:'denied'};});return JSON.stringify({abstain:false,claims:[{chunkId:'sample:1:0',quote:d.content}]});}},{...defaultLimits,intervalMs:0});
 const result=await answer(repo,'테스트성분알파',{api,publicQuestion:true});assert.equal(result.status,'insufficient_evidence');assert.deepEqual(result.claims,[]);
});
