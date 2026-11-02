import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { assertTextIntegrity, decodeUtf8 } from '../src/encoding.js';
import { GeminiProvider } from '../src/gemini.js';
import { register } from '../src/repository.js';
import { splitDocument, hash } from '../src/model.js';
import { fixture, withRepo } from './helpers.js';
test('strict UTF-8 accepts Korean/BOM and rejects invalid bytes and UTF-16',()=>{
 const text='질문 수면 문서 확인된 자료가 부족하여 답변할 수 없습니다';
 assert.equal(decodeUtf8(Buffer.from(text)),text);assert.equal(decodeUtf8(Buffer.concat([Buffer.from([239,187,191]),Buffer.from(text)])),text);
 assert.throws(()=>decodeUtf8(Buffer.from([0xb0,0xa1])),/INVALID_UTF8/);assert.throws(()=>decodeUtf8(Buffer.from([255,254,0,0])),/INVALID_UTF8/);
});
test('damaged medical text is refused before registration and source stays intact',async()=>withRepo(async repo=>{
 for(const content of ['수면\uFFFD안내','ìˆ˜ë©´','손상\uD800','의약품\u0000정보'])await assert.rejects(register(repo,fixture('bad',content)),/TEXT_ENCODING_REVIEW_REQUIRED/);
 assert.equal(Object.keys((await repo.read()).documents).length,0);
 const d=fixture('ko','잠들기가 힘들어요. 한국어 원문입니다.');d.title='정상 한국어 제목';await register(repo,d);
 const stored=(await repo.read()).documents.ko!;assert.equal(stored.content,d.content);assert.equal(stored.title,d.title);assert.equal(stored.contentHash,hash(d.content));
}));
test('corrupted stored text is refused on reload, not silently re-indexed',async()=>withRepo(async repo=>{
 await register(repo,fixture());const state=await repo.read();state.documents.sample!.content='깨짐\uFFFD';await writeFile(join(repo.directory,'state.json'),JSON.stringify(state),'utf8');
 await assert.rejects(repo.read(),/TEXT_ENCODING_REVIEW_REQUIRED/);
}));
test('SDK JSON carries original Korean exactly, and corrupted text makes zero requests',async()=>{
 const korean='잠들기가 힘들어요. 휴식 자료의 한국어 원문';let calls=0;
 const api=new GeminiProvider('unit-test-placeholder-not-real',undefined,{fetch:async(_u,init)=>{
  calls++;const body=JSON.parse(String(init?.body));assert.equal(body.requests[0].content.parts[0].text,korean);
  return new Response(JSON.stringify({embeddings:[{values:Array.from({length:768},(_,i)=>i===0?1:0)}]}),{headers:{'content-type':'application/json'}});
 }});
 await api.embed(korean,'RETRIEVAL_QUERY',new AbortController().signal);assert.equal(calls,1);
 await assert.rejects(api.embed('깨짐\uFFFD','RETRIEVAL_DOCUMENT',new AbortController().signal),/TEXT_ENCODING_REVIEW_REQUIRED/);assert.equal(calls,1);
});
test('PowerShell 5.1 reproduces legacy corruption and fixes UTF-8 stdout/stdin',()=>{
 const p=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/encoding-probe.ps1'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 const r=JSON.parse(p.stdout);assert.equal(r.legacyCp949OutputCorruptionReproduced,true);assert.equal(r.explicitUtf8OutputPreserved,true);assert.equal(r.asciiStdinCorruptionReproduced,true);assert.equal(r.utf8StdinPreserved,true);
});
test('PowerShell 7 roundtrip when installed',t=>{
 const p=spawnSync('pwsh',['-NoProfile','-File','scripts/encoding-probe.ps1'],{encoding:'utf8'});if(p.error){t.skip('PowerShell 7 not installed');return;}
 assert.equal(p.status,0,p.stderr);const r=JSON.parse(p.stdout);assert.equal(r.explicitUtf8OutputPreserved,true);assert.equal(r.utf8StdinPreserved,true);
});

test('chunk boundaries and overlap never split Unicode surrogate pairs',()=>{
 const input=fixture('astral','수면🌙'.repeat(100));const d={...input,version:1,contentHash:hash(input.content)};
 for(const overlap of [0,1,63]){
  const chunks=splitDocument(d,64,overlap);assert.ok(chunks.length<d.content.length);
  for(const c of chunks){assertTextIntegrity(c.text);assert.equal(c.text,d.content.slice(c.start,c.end));}
  assert.equal(chunks.at(-1)!.end,d.content.length);
 }
});
