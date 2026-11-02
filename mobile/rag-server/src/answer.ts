import { normalize } from './model.js';
import type { Repository } from './repository.js';
import { SearchIndex, insufficientEvidenceMessage, type Hit, type SearchOptions } from './search.js';
import { GuardedProvider, embeddingProfile } from './gemini.js';
export function routeSafety(question:string):'emergency'|'professional'|'privacy'|null {
 if(/숨.{0,4}(못|안|않)|호흡곤란|의식.{0,4}(없|잃)|가슴.{0,8}(통증|아프)|심한.{0,4}출혈|자살|자해|과다.?복용|죽고.?싶/iu.test(question))return 'emergency';
 if(/주민등록|\b\d{6}[- ]?[1-4]\d{6}\b|01[016789][- ]?\d{3,4}[- ]?\d{4}|환자명|진료기록|복약기록/u.test(question))return 'privacy';
 if(/몇\s*(알|정|mg|밀리)|용량|진단해|진단해줘|약.{0,10}(끊|중단|바꿔|늘려|줄여)|처방.{0,8}(중단|변경)|나.{0,5}치료법/u.test(question))return 'professional';
 return null;
}
export const safetyMessages={
 emergency:'즉각적인 위험이 의심됩니다. 검색 답변을 기다리지 말고 지역 응급서비스나 가까운 응급실의 도움을 받으세요.',
 professional:'개인별 진단·복용량·처방 변경은 이 검색 엔진에서 결정하지 않습니다. 담당 의료진 또는 약사와 상담하세요.',
 privacy:'개인정보나 진료·복약 기록을 입력하지 마세요. 개인정보를 제거한 일반 질문만 사용할 수 있습니다.'
};
export function validateClaims(raw:string,hits:Hit[]) {
 let data:unknown;try{data=JSON.parse(raw);}catch{throw new Error('INVALID_MODEL_RESPONSE');}
 const d=data as {abstain?:unknown;claims?:unknown};
 if(!d || typeof d.abstain!=='boolean'||!Array.isArray(d.claims)||d.claims.length>5)throw new Error('INVALID_MODEL_RESPONSE');
 if(d.abstain)return [];
 if(!d.claims.length)throw new Error('INVALID_MODEL_RESPONSE');
 return d.claims.map((value:unknown)=>{
   if(!value || typeof value!=='object')throw new Error('INVALID_CITATION');
   const c=value as {chunkId?:unknown;quote?:unknown};
   const source=hits.find(h=>h.chunkId===c.chunkId);
   if(!source || typeof c.quote!=='string' || c.quote.trim().length<8 || c.quote.length>800 || !source.text.includes(c.quote))throw new Error('INVALID_CITATION');
   return {quote:c.quote,documentId:source.documentId,chunkId:source.chunkId,title:source.title,sourceUrl:source.sourceUrl,updatedAt:source.updatedAt};
 });
}
export async function answer(repo:Repository,question:string,options:{api?:GuardedProvider;publicQuestion?:boolean;search?:Partial<SearchOptions>}={}) {
 if(!question.trim()||question.length>2000)throw new Error('INVALID_QUERY');
 const route=routeSafety(question);if(route)return {status:route,message:safetyMessages[route],claims:[]};
 const state=await repo.read();
 const disclaimer='일반 건강정보 자료의 인용입니다. 개인별 의료 판단이나 의료적 정확성을 보장하지 않습니다.';
 if(!options.api) {
   const result=new SearchIndex(state).search(question,options.search);
   return {status:result.status==='ok'?'local_evidence':'insufficient_evidence',message:result.status==='ok'?disclaimer:insufficientEvidenceMessage,hits:result.hits,mock:true};
 }
 if(!options.publicQuestion)throw new Error('PUBLIC_NONPERSONAL_QUESTION_REQUIRED');
 // Never send synthetic documents to Gemini or mix test evidence into a real answer.
 const live=structuredClone(state);
 for(const [id,c] of Object.entries(live.chunks))if(live.documents[c.documentId]?.rights.permission!=='permitted'){delete live.chunks[id];delete live.vectors[id];}
 if(!Object.keys(live.chunks).length)return {status:'insufficient_evidence',message:insufficientEvidenceMessage,claims:[]};
 const values=await options.api.embed(normalize(question),'RETRIEVAL_QUERY');
 const result=new SearchIndex(live).search(question,options.search,{profile:embeddingProfile,values});
 if(result.status!=='ok')return {status:'insufficient_evidence',message:insufficientEvidenceMessage,claims:[]};
 // Vector-only relevance has not been calibrated on real medical evidence. Search may show candidates; answer generation must abstain.
 if(result.hits.every(h=>h.keywordScore<0.2))return {status:'insufficient_evidence',message:insufficientEvidenceMessage,claims:[],reason:'uncalibrated_vector_only_evidence'};
 const evidence=result.hits.map(h=>({chunkId:h.chunkId,text:h.text}));
 const prompt=JSON.stringify({task:'질문에 답하는 원문 인용문을 선택. 자료가 충돌하면 보류. JSON만 출력.',question,untrustedEvidence:evidence});
 try {
   const claims=validateClaims(await options.api.select(prompt),result.hits);
   return {status:claims.length?'grounded_quotes':'insufficient_evidence',claims,message:claims.length?disclaimer:insufficientEvidenceMessage};
 }catch(e){if(e instanceof Error && ['INVALID_CITATION','INVALID_MODEL_RESPONSE'].includes(e.message))return {status:'unverified_response',claims:[]};throw e;}
}
