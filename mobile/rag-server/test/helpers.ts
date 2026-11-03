import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalRepository } from '../src/repository.js';
import {hash,type DocumentInput} from '../src/model.js';
import type {PermissionScope} from '../src/rights.js';
// Explicit reviews for authored fixtures only. Never used to approve saved data.
export function reviewFixture<T extends DocumentInput>(doc:T,scopes:PermissionScope[]=['local_search','quotation'],version=1):T {
 doc.rights.scopes=Object.fromEntries(scopes.map(scope=>[scope,{decision:'permitted',scope,evidenceUrl:'https://example.org/synthetic-license',reviewedAt:'2026-11-03',reviewer:'synthetic-test-author',documentId:doc.id,documentVersion:version,contentHash:hash(doc.content),purpose:'Synthetic regression only'}]));return doc;
}
export function fixture(id='sample',content='테스트성분알파 복약 안내 가상 문서입니다.'):DocumentInput {
 return reviewFixture({id,title:'가상 복약 안내',publisher:'TEST ONLY',sourceUrl:`https://example.org/${id}`,publishedAt:null,updatedAt:'2026-11-02',collectedAt:'2026-11-02',category:'medication',content,rights:{terms:'Synthetic test fixture; not medical evidence',permission:'test-only',checkedAt:'2026-11-02'}});
}
export async function withRepo(fn:(r:LocalRepository)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'drmas-'));try{await fn(new LocalRepository(dir));}finally{await rm(dir,{recursive:true,force:true});}}
