import { normalize, type State } from './model.js';
import type { Hit } from './search.js';
export interface EvidencePolicy { minVector:number; minFacetCoverage:number; minSeparation:number }
export interface RankedHit extends Hit { facetCoverage:number; rerankScore:number; sourceValid:boolean }
export function sourceMatches(hit:Hit,state:State):boolean {
 const d=state.documents[hit.documentId],c=state.chunks[hit.chunkId];
 return !!d&&!!c&&c.documentId===d.id&&c.version===d.version&&hit.version===d.version&&hit.title===d.title&&hit.publisher===d.publisher&&hit.updatedAt===d.updatedAt&&hit.sourceUrl===d.sourceUrl&&hit.text===c.text&&c.text===d.content.slice(c.start,c.end);
}
/** Rule-based demonstration, not a learned medical reranker. Facets must be specified independently of relevance labels. */
export function rerankEvidence(hits:Hit[],facets:string[][],state:State,policy:EvidencePolicy) {
 for(const x of Object.values(policy))if(!Number.isFinite(x)||x<0||x>1)throw new Error('INVALID_EVIDENCE_POLICY');
 const ranked:RankedHit[]=hits.map(h=>{
  const text=normalize(`${h.title} ${h.text}`);
  const facetCoverage=facets.length?facets.filter(group=>group.some(term=>text.includes(normalize(term)))).length/facets.length:0;
  return {...h,facetCoverage,sourceValid:sourceMatches(h,state),rerankScore:0.6*Math.max(0,h.vectorScore??0)+0.15*h.keywordScore+0.25*facetCoverage};
 }).sort((a,b)=>b.rerankScore-a.rerankScore||a.chunkId.localeCompare(b.chunkId));
 const qualified=ranked.filter(h=>h.sourceValid&&h.vectorScore!==null&&h.vectorScore>=policy.minVector&&h.facetCoverage>=policy.minFacetCoverage);
 const rejected=ranked.filter(h=>!qualified.includes(h));
 const separation=qualified[0]&&rejected[0]?qualified[0].rerankScore-rejected[0].rerankScore:null;
 const ambiguous=separation!==null&&separation<policy.minSeparation;
 return {ranked,hits:ambiguous?[]:qualified,status:qualified.length&&!ambiguous?'evidence_available':'insufficient_evidence',reason:!qualified.length?'no_qualified_evidence':ambiguous?'ambiguous_evidence':'qualified',separation};
}
export interface Judgement { relevantDocumentIds:string[] }
export function retrievalMetrics(results:{ids:string[];relevantDocumentIds:string[]}[],k:number){
 if(!Number.isInteger(k)||k<1)throw new Error('INVALID_K');
 let precision=0,recall=0,rr=0,answerable=0,unknown=0,abstained=0,trueAbstained=0,falseAnswers=0,totalReturned=0,totalRelevantReturned=0;
 for(const r of results){
  const ids=[...new Set(r.ids)].slice(0,k),gold=new Set(r.relevantDocumentIds);
  totalReturned+=ids.length;totalRelevantReturned+=ids.filter(id=>gold.has(id)).length;
  if(gold.size){answerable++;const found=ids.filter(id=>gold.has(id)).length;precision+=found/k;recall+=found/gold.size;const rank=ids.findIndex(id=>gold.has(id));rr+=rank<0?0:1/(rank+1);}
  else {unknown++;if(ids.length)falseAnswers++;}
  if(!ids.length){abstained++;if(!gold.size)trueAbstained++;}
 }
 // P@K averages all queries (unanswerable queries contribute zero). Missing slots count as nonrelevant.
 return {k,queries:results.length,precisionAtK:results.length?precision/results.length:null,recallAtK:answerable?recall/answerable:null,mrrAtK:results.length?rr/results.length:null,answerableMrrAtK:answerable?rr/answerable:null,returnedPrecisionAtK:totalReturned?totalRelevantReturned/totalReturned:null,answerable,unanswerable:unknown,abstentionRecall:unknown?trueAbstained/unknown:null,abstentionPrecision:abstained?trueAbstained/abstained:null,unsupportedAnswerRate:unknown?falseAnswers/unknown:null};
}
