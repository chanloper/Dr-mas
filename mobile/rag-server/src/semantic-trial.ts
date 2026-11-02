import { emptyState, hash, normalize, type DocumentInput, type State } from './model.js';
import { register, type Repository } from './repository.js';
import { GuardedProvider, indexDocuments, embeddingProfile, embeddingSettings, type Provider } from './gemini.js';
import { SearchIndex } from './search.js';
const base={publisher:'SYNTHETIC TEST ONLY',publishedAt:null,updatedAt:'2026-11-02',collectedAt:'2026-11-02',category:'lifestyle' as const,rights:{terms:'Directly authored synthetic retrieval fixture. Not medical evidence.',permission:'test-only' as const,checkedAt:'2026-11-02'}};
export const semanticDocuments:DocumentInput[]=[
 {...base,id:'semantic-rest',title:'휴식 자료',sourceUrl:'https://example.org/semantic-rest',content:'야간 수면과 규칙적인 취침 환경에 관한 합성 문서입니다. 검색 기능 검증 전용이며 실제 의료 조언이 아닙니다.'},
 {...base,id:'semantic-activity',title:'활동 자료',sourceUrl:'https://example.org/semantic-activity',content:'걷기와 신체 운동에 관한 합성 문서입니다. 검색 기능 검증 전용이며 실제 의료 조언이 아닙니다.'}
];
export const semanticQuestions=[{question:'잠들기가 힘들어요',expectedDocumentId:'semantic-rest'}] as const;
export const semanticLimits={maxCalls:3,maxCharacters:512,timeoutMs:10000,attempts:1,intervalMs:1100} as const;
// Demo threshold only: do not change production thresholds or claim calibrated medical relevance.
export const semanticMinVector=0.5;
// Official standard text embedding rate, checked 2026-11-02; not a billing-system hard cap.
export function semanticCostPreflight(maxEstimatedUsd=0.001) {
 const usdPerMillionInputTokens=0.15;
 const modelMaxInputTokens=2048;
 const worstCaseInputCostUsd=semanticLimits.maxCalls*modelMaxInputTokens*usdPerMillionInputTokens/1_000_000;
 if(!Number.isFinite(maxEstimatedUsd)||maxEstimatedUsd<0||worstCaseInputCostUsd>maxEstimatedUsd)throw new Error('SEMANTIC_ESTIMATED_COST_LIMIT');
 return {maxEstimatedUsd,usdPerMillionInputTokens,modelMaxInputTokens,worstCaseInputCostUsd,estimateOnly:true,pricingCheckedAt:'2026-11-02',source:'https://ai.google.dev/gemini-api/docs/pricing'};
}
export const syntheticAllowlist=()=>new Map(semanticDocuments.map(d=>[d.id,hash(d.content)]));
export class TransientRepository implements Repository {
 private state=emptyState();
 async read(){return structuredClone(this.state);}
 async transaction<T>(fn:(s:State)=>Promise<T>|T){const draft=structuredClone(this.state);const result=await fn(draft);this.state=draft;return result;}
}
export function mockSemanticProvider():Provider {
 return {embed:async(text)=>{const dimension=text.includes('걷기')?1:0;return Array.from({length:embeddingSettings.dimensions},(_,i)=>i===dimension?1:0);},select:async()=>{throw new Error('GENERATION_NOT_ALLOWED');}};
}
export async function runSemanticTrial(repo:Repository,provider:Provider,mode:'mock'|'live') {
 const costControl=semanticCostPreflight();
 const initial=await repo.read();
 if(Object.keys(initial.documents).length||initial.usage.calls)throw new Error('SEMANTIC_STORE_MUST_BE_EMPTY');
 const inputCharacters=semanticDocuments.reduce((n,d)=>n+d.content.length,0)+semanticQuestions.reduce((n,q)=>n+normalize(q.question).length,0);
 if(inputCharacters>semanticLimits.maxCharacters)throw new Error('SEMANTIC_INPUT_BUDGET');
 for(const doc of semanticDocuments)await register(repo,doc);
 const baseline=new SearchIndex(await repo.read()).search(semanticQuestions[0].question);
 if(baseline.hits.length)throw new Error('SEMANTIC_FIXTURE_HAS_KEYWORD_MATCH');
 const api=new GuardedProvider(repo,provider,{...semanticLimits});
 const indexing=await indexDocuments(repo,api,2,{syntheticTestDocuments:syntheticAllowlist()});
 if(indexing.indexed!==2)throw new Error('SEMANTIC_INDEX_INCOMPLETE');
 const values=await api.embed(normalize(semanticQuestions[0].question),embeddingSettings.queryTask);
 const indexed=await repo.read();
 const index=new SearchIndex(indexed);
 const queryVector={profile:embeddingProfile,values};
 const result=index.search(semanticQuestions[0].question,{minVector:semanticMinVector},queryVector);
 // Preserve all candidate scores as diagnostics, even if the demo threshold rejects them.
 const rankings=index.search(semanticQuestions[0].question,{minKeyword:0,minVector:0},queryVector).hits;
 const first=result.hits[0];
 const success=first?.documentId===semanticQuestions[0].expectedDocumentId&&first.keywordScore===0&&first.vectorScore!==null&&first.vectorScore>=semanticMinVector;
 return {accuracyValidated:false,evidenceSuitabilityValidated:false,costControl,mode,mock:mode==='mock',actualEmbeddingCalls:mode==='live'?indexed.usage.calls:0,mockEmbeddingCalls:mode==='mock'?indexed.usage.calls:0,apiAttemptsReserved:indexed.usage.calls,status:success?'semantic_search_success':'semantic_search_not_verified',semanticSearchPassed:!!success,embeddingSettings,embeddingProfile,limits:semanticLimits,inputCharacters,vectorThreshold:semanticMinVector,thresholdCalibrated:false,indexing,keywordOnly:baseline,question:semanticQuestions[0].question,expectedDocumentId:semanticQuestions[0].expectedDocumentId,hits:result.hits,rankings,scope:'Synthetic retrieval test only. No medical evidence and no answer-generation API.'};
}
