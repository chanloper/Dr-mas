import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticChat,syntheticChatDocuments} from '../src/synthetic-chat.js';
import {localChat} from '../src/http-api.js';
import {emptyState,hash} from '../src/model.js';
import {register,type Repository} from '../src/repository.js';

test('isolated synthetic search returns exact quote and source metadata without external APIs',async()=>{
 const chat=await createSyntheticChat('development');
 for(const [query,id]of [['합성안내카드알파','synthetic_card_alpha'],['합성안내카드베타','synthetic_card_beta']]){
  const result=await chat(query!);const doc=syntheticChatDocuments.find(d=>d.id===id)!;
  assert.equal(result.status,'local_evidence');assert.equal(result.mode,'synthetic');assert.match(result.disclaimer,/실제 의료정보나 복약 지침이 아닙니다/);
  assert.equal(result.sources.length,1);const source=result.sources[0]!;
  assert.equal(source.documentId,id);assert.ok(source.chunkId.startsWith(id!));assert.equal(source.title,doc.title);assert.equal(source.quote,doc.content);assert.equal(source.sourceUrl,doc.sourceUrl);assert.equal(source.publisher,doc.publisher);assert.equal(source.updatedAt,doc.updatedAt);
 }
 assert.equal((await chat('우주선감마')).status,'insufficient_evidence');assert.deepEqual((await chat('우주선감마')).sources,[]);
 assert.equal((await chat('호흡곤란')).status,'emergency');
 await assert.rejects(createSyntheticChat('production'),/SYNTHETIC_MODE_NOT_ALLOWED/);
});
test('test-only sources stay blocked in default mode; content mutation invalidates explicit allowlist',async()=>{
 let state=emptyState();const repo:Repository={read:async()=>structuredClone(state),transaction:async fn=>{const next=structuredClone(state);const result=await fn(next);state=next;return result;}};
 const doc=syntheticChatDocuments[0]!;await register(repo,doc);
 assert.equal((await localChat(repo,'합성안내카드알파')).sources.length,0);
 const allowed=new Map([[doc.id,hash(doc.content)]]);
 assert.equal((await localChat(repo,'합성안내카드알파',{syntheticDocuments:allowed})).sources.length,1);
 state.documents[doc.id]!.content+=' 변경';
 assert.equal((await localChat(repo,'합성안내카드알파',{syntheticDocuments:allowed})).sources.length,0);
 assert.equal(state.usage.calls,0);
});
