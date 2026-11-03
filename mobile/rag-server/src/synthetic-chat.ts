import { emptyState,hash,type DocumentInput } from './model.js';
import { register,type Repository } from './repository.js';
import { localChat } from './http-api.js';

// Deliberately contains no medical facts, patient data or real product names.
export const syntheticChatDocuments:DocumentInput[]=[
 {id:'synthetic_card_alpha',title:'[합성 테스트] 알파 안내카드',publisher:'Dr.MAS 합성 테스트',sourceUrl:'https://example.org/drmas-synthetic/alpha',publishedAt:null,updatedAt:'2026-11-03',collectedAt:'2026-11-03',category:'medication',
  content:'합성안내카드알파의 색상 표식은 파랑입니다. 이 문장은 검색과 출처 표시만 검사합니다. 실제 의약품, 효능, 용량 또는 복약 지침이 아닙니다.',rights:{permission:'test-only',terms:'Developer-authored synthetic retrieval fixture; never medical evidence',checkedAt:'2026-11-03'}},
 {id:'synthetic_card_beta',title:'[합성 테스트] 베타 안내카드',publisher:'Dr.MAS 합성 테스트',sourceUrl:'https://example.org/drmas-synthetic/beta',publishedAt:null,updatedAt:'2026-11-03',collectedAt:'2026-11-03',category:'medication',
  content:'합성안내카드베타의 도형 표식은 네모입니다. 이 문장은 검색과 출처 표시만 검사합니다. 실제 의약품, 효능, 용량 또는 복약 지침이 아닙니다.',rights:{permission:'test-only',terms:'Developer-authored synthetic retrieval fixture; never medical evidence',checkedAt:'2026-11-03'}}
];
export async function createSyntheticChat(environment:string|undefined){
 if(environment==='production')throw new Error('SYNTHETIC_MODE_NOT_ALLOWED');
 const allowed=new Map(syntheticChatDocuments.map(d=>[d.id,hash(d.content)]));
 let state=emptyState();
 const repo:Repository={read:async()=>structuredClone(state),transaction:async fn=>{const next=structuredClone(state);const result=await fn(next);state=next;return result;}};
 for(const d of syntheticChatDocuments)await register(repo,d);
 return (question:string)=>localChat(repo,question,{syntheticDocuments:allowed});
}
