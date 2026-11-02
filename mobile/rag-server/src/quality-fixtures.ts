import { emptyState, hash, normalize, splitDocument, type DocumentInput } from './model.js';
import type { Hit } from './search.js';
import { tokens } from './search.js';
import { rerankEvidence, retrievalMetrics, sourceMatches, type EvidencePolicy } from './retrieval-quality.js';
const texts=[
 ['sleep-light','수면 환경 조명','야간 취침 침실 조명 조절 항목'],['sleep-sound','수면 환경 소음','야간 취침 침실 소음 차단 항목'],['sleep-stats','수면 통계','야간 수면 시간 표본 통계 항목'],
 ['walk-log','보행 기록','걷기 보행 일정 활동 기록 항목'],['walk-pace','보행 강도','걷기 보행 속도 운동 강도 기록 항목'],['sport-history','운동 역사','신체 운동 스포츠 역사 연표 항목'],
 ['drug-label','약품 포장','의약품 포장 유효기한 표시 항목'],['drug-storage','약품 보관','의약품 포장 보관 온도 표시 항목'],['drug-sales','약품 통계','의약품 시장 판매 통계 항목'],
 ['astronomy','천문 자료','은하 별자리 관측 항목'],['music','음악 자료','피아노 악보 박자 항목'],['travel','관광 자료','기차 노선 관광 지도 항목']
] as const;
export const qualityState=emptyState();
for(const [id,title,text] of texts){
 const input:DocumentInput={id,title,publisher:'SYNTHETIC ONLY',sourceUrl:`https://example.org/quality/${id}`,publishedAt:null,updatedAt:'2026-11-02',collectedAt:'2026-11-02',category:'lifestyle',content:`${text}. 가상 안내서 검색 검증용 표식이며 실제 의료 조언이 아닙니다.`,rights:{terms:'Authored synthetic evaluation only',permission:'test-only',checkedAt:'2026-11-02'}};
 const d={...input,version:1,contentHash:hash(input.content)};qualityState.documents[id]=d;for(const c of splitDocument(d))qualityState.chunks[c.id]=c;
}
export interface QualityCase { id:string;split:'calibration'|'heldout';question:string;facets:string[][];relevantDocumentIds:string[];nearMissIds:string[];scores:Record<string,number> }
// Similarities are deliberately scripted stress fixtures, NOT Gemini vectors. Gold IDs are not used by the reranker.
export const qualityCases:QualityCase[]=[
 {id:'cal-sleep',split:'calibration',question:'잠자리 불빛과 시끄러움 항목',facets:[['수면','취침'],['조명','소음']],relevantDocumentIds:['sleep-light','sleep-sound'],nearMissIds:['sleep-stats'],scores:{'sleep-stats':0.78,'sleep-light':0.73,'sleep-sound':0.71}},
 {id:'cal-drug',split:'calibration',question:'약 상자의 날짜와 온도 항목',facets:[['약품','의약품'],['유효기한','보관']],relevantDocumentIds:['drug-label','drug-storage'],nearMissIds:['drug-sales'],scores:{'drug-sales':0.79,'drug-label':0.74,'drug-storage':0.72}},
 {id:'cal-none-a',split:'calibration',question:'우주선 엔진 수리 근거',facets:[['우주선'],['엔진']],relevantDocumentIds:[],nearMissIds:['astronomy'],scores:{astronomy:0.67}},
 {id:'cal-none-b',split:'calibration',question:'체온계 교정 절차',facets:[['체온계'],['교정']],relevantDocumentIds:[],nearMissIds:[],scores:{'drug-label':0.63}},
 {id:'held-walk',split:'heldout',question:'산책 횟수와 빠르기 일지',facets:[['걷기','보행'],['일정','속도','기록']],relevantDocumentIds:['walk-log','walk-pace'],nearMissIds:['sport-history'],scores:{'sport-history':0.80,'walk-log':0.75,'walk-pace':0.70}},
 {id:'held-room',split:'heldout',question:'잠자리 조도 조절',facets:[['취침','수면'],['조명']],relevantDocumentIds:['sleep-light'],nearMissIds:['sleep-stats','sleep-sound'],scores:{'sleep-stats':0.77,'sleep-sound':0.74,'sleep-light':0.70}},
 {id:'held-none-a',split:'heldout',question:'약물 상호작용의 실험 수치',facets:[['약품','의약품'],['상호작용']],relevantDocumentIds:[],nearMissIds:['drug-sales','drug-label'],scores:{'drug-sales':0.79,'drug-label':0.76}},
 {id:'held-none-b',split:'heldout',question:'수면검사 판독과 진단 기준',facets:[['수면'],['판독','진단']],relevantDocumentIds:[],nearMissIds:['sleep-stats'],scores:{'sleep-stats':0.81}}
];
export function qualityCandidates(q:QualityCase):Hit[]{
 const terms=tokens(q.question);
 return Object.values(qualityState.chunks).map(c=>{const d=qualityState.documents[c.documentId]!;const text=normalize(`${d.title} ${c.text}`);const keywordScore=terms.filter(t=>text.includes(t)).length/Math.max(1,terms.length);const vectorScore=q.scores[d.id]??0.35;return {documentId:d.id,chunkId:c.id,title:d.title,publisher:d.publisher,sourceUrl:d.sourceUrl,updatedAt:d.updatedAt,version:d.version,text:c.text,keywordScore,vectorScore,score:0.55*keywordScore+0.45*vectorScore};}).sort((a,b)=>b.vectorScore!-a.vectorScore!);
}
export function evaluateQuality(cases:QualityCase[],policy:EvidencePolicy,baseline=false){
 let sourceChecks=0,validSources=0,nearMissReturned=0;
 const results=cases.map(q=>{
  const candidates=qualityCandidates(q);
  const hits=baseline?candidates.filter(h=>h.vectorScore!>=0.5):rerankEvidence(candidates,q.facets,qualityState,policy).hits;
  for(const h of hits){sourceChecks++;if(sourceMatches(h,qualityState))validSources++;if(q.nearMissIds.includes(h.documentId))nearMissReturned++;}
  return {questionId:q.id,ids:hits.map(h=>h.documentId),relevantDocumentIds:q.relevantDocumentIds};
 });
 return {metrics:[1,3,5].map(k=>retrievalMetrics(results,k)),sourceConsistency:sourceChecks?validSources/sourceChecks:null,nearMissReturned,results};
}
export function runQualityEvaluation(){
 const calibration=qualityCases.filter(q=>q.split==='calibration'),heldout=qualityCases.filter(q=>q.split==='heldout');
 const sweep=[];
 for(const minVector of [0.5,0.65,0.75])for(const minFacetCoverage of [0.5,1])for(const minSeparation of [0,0.04,0.1]){
  const policy={minVector,minFacetCoverage,minSeparation};const report=evaluateQuality(calibration,policy);const m=report.metrics[1]!;
  const objective=(m.precisionAtK??0)+(m.recallAtK??0)+(m.abstentionRecall??0)-(m.unsupportedAnswerRate??0);
  sweep.push({policy,objective,metrics:m});
 }
 sweep.sort((a,b)=>b.objective-a.objective||b.policy.minFacetCoverage-a.policy.minFacetCoverage||b.policy.minSeparation-a.policy.minSeparation||b.policy.minVector-a.policy.minVector);
 const selected=sweep[0]!.policy;
 return {mode:'mock',actualApiCalls:0,scoresAreScripted:true,scope:'synthetic-only; not production calibration or clinical validation',documents:texts.length,calibrationQueries:calibration.length,heldoutQueries:heldout.length,selectedPolicy:selected,productionPolicyChanged:false,baselineHeldout:evaluateQuality(heldout,selected,true),rerankedHeldout:evaluateQuality(heldout,selected),sweep};
}
