import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalRepository, register, removeDocument } from '../src/repository.js';
import { splitDocument, hash } from '../src/model.js';
import { SearchIndex } from '../src/search.js';
import { fixture, withRepo } from './helpers.js';
test('chunk offsets, metadata linkage and overlap are preserved',()=>{
 const input=fixture('long','가상의 문서 내용입니다.\n'.repeat(200)); const d={...input,version:1,contentHash:hash(input.content)};
 const chunks=splitDocument(d); assert.ok(chunks.length>2);
 for(const c of chunks){assert.equal(c.documentId,d.id);assert.equal(c.version,1);assert.equal(c.text,d.content.slice(c.start,c.end));assert.ok(c.text.length<=800);}
 assert.equal(chunks.at(-1)!.end,d.content.length);
});
test('duplicate, metadata refresh, changed document and delete survive restart',async()=>withRepo(async r=>{
 assert.equal((await register(r,fixture())).status,'created');
 assert.equal((await register(r,fixture('other'))).status,'duplicate');
 assert.equal((await register(r,{...fixture(),title:'갱신 제목'})).status,'metadata-updated');
 await r.transaction(s=>{const id=Object.keys(s.chunks)[0]!;s.vectors[id]={profile:'test',values:[1,0]};});
 assert.equal((await register(r,fixture('sample','테스트성분베타 변경된 내용입니다.'))).version,2);
 const state=await new LocalRepository(r.directory).read();assert.equal(Object.keys(state.vectors).length,0);
 assert.ok(Object.values(state.chunks).every(c=>c.version===2));
 assert.equal(state.documents.sample!.sourceUrl,'https://example.org/sample');
 assert.equal((await removeDocument(r,'sample')).deleted,true);assert.equal(Object.keys((await r.read()).chunks).length,0);
}));
test('ingredient substring, Korean compounds and no-evidence query',async()=>withRepo(async r=>{
 await register(r,fixture());const index=new SearchIndex(await r.read());
 const result=index.search('테스트성분알파'); assert.equal(result.status,'ok'); assert.equal(result.hits[0]!.sourceUrl,'https://example.org/sample');
 assert.equal(index.search('은하수우주선').status,'insufficient_evidence');
 assert.throws(()=>index.search('x',{minKeyword:NaN}));
}));
test('invalid metadata and source URLs are rejected',async()=>withRepo(async r=>{
 await assert.rejects(register(r,{...fixture(),sourceUrl:'javascript:alert(1)'}));
 await assert.rejects(register(r,{...fixture(),rights:undefined}));
 await assert.rejects(register(r,{...fixture(),collectedAt:'not a date'}));
 for(const id of ['__proto__','constructor','toString'])await assert.rejects(register(r,{...fixture(),id}));
}));
