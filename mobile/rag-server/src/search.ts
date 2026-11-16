export const insufficientEvidenceMessage='확인된 자료가 부족하여 답변할 수 없습니다';
import { normalize, type MedicalDocument, type State, type Chunk } from './model.js';
import {hasPermission,hasChunkPermission} from './rights.js';
import {sourceAttribution} from './attribution.js';
import type {SourceAttribution} from './model.js';
import { symptomSubjects } from './symptom-query.js';
import { isKdcaDocument, kdcaQuoteForQuestion } from './kdca-use.js';
export interface Hit { documentId:string; chunkId:string; title:string; publisher:string; sourceUrl:string; updatedAt:string|null; version:number; text:string; score:number; keywordScore:number; vectorScore:number|null;attribution?:SourceAttribution }
export interface SearchOptions { limit:number; minKeyword:number; minVector:number }
export const defaults:SearchOptions={limit:5,minKeyword:0.2,minVector:0.75}; // Provisional: calibrate using an independent evaluation set.
export function tokens(text:string):string[] { return [...new Set(normalize(text).match(/[\p{L}\p{N}]+/gu)??[])]; }
const questionFillers=new Set(['어떻게','무엇','무엇을','뭐','어떤','어디','어디에서','어디서','알려주세요','알려줘','주세요','궁금해요','확인하나요','있나요','때','이','그','좀']);
const genericMedicine=new Set(['약','약을','약의','약은','약이','의약품','약품']);
const medicineTopics=new Set(['효능','사용법','복용법','복용방법','주의사항','주의','부작용','상호작용','보관','보관방법','보관법']);
// Bounded lexical normalization only; never paraphrase evidence or infer medical
// synonyms/diagnoses. Preserve the original question for safety routing.
export function queryTerms(question:string):string[] {
 return [...new Set(tokens(question).map(term=>{
  if(questionFillers.has(term))return '';
  const base=term.replace(/^(.{2,}?)(에서|으로|에게|까지|부터|은|는|을|를|의)$/u,'$1');
  if(/^보관(?:하나요|할까요|해야하나요|하는|할|방법|법)?$/u.test(base))return '보관';
  if(base==='주의할점'||base==='주의점')return '주의사항';
  return questionFillers.has(base)||genericMedicine.has(base)?'':base;
 }).filter(Boolean))];
}
export function cosine(a:number[],b:number[]):number {
  if(a.length!==b.length || !a.length || !a.every(Number.isFinite)||!b.every(Number.isFinite)) throw new Error('INVALID_VECTOR');
  const norm=Math.hypot(...a)*Math.hypot(...b); return norm?a.reduce((sum,v,i)=>sum+v*b[i]!,0)/norm:0;
}
export class SearchIndex {
  private postings=new Map<string,Set<string>>(); private chunks:Chunk[];
  constructor(private state:State) {
    this.chunks=Object.values(state.chunks).filter(c=>hasChunkPermission(state.documents[c.documentId],c,'local_search'));
    for(const c of this.chunks) {
      const d=state.documents[c.documentId]!;
      const s=normalize(`${d.title} ${c.text}`);
      // Character bigrams support Korean compounds and product/ingredient substrings.
      for(let i=0;i<s.length-1;i++){ const key=s.slice(i,i+2); let ids=this.postings.get(key); if(!ids)this.postings.set(key,ids=new Set()); ids.add(c.id); }
    }
  }
  search(question:string,options:Partial<SearchOptions>={},queryVector?:{profile:string;values:number[]}) {
    const query=normalize(question); if(!query || query.length>2000) throw new Error('INVALID_QUERY');
    const cfg={...defaults,...options};
    if(!Number.isInteger(cfg.limit)||cfg.limit<1||cfg.limit>20 || !Number.isFinite(cfg.minKeyword)||cfg.minKeyword<0||cfg.minKeyword>1||!Number.isFinite(cfg.minVector)||cfg.minVector<0||cfg.minVector>1) throw new Error('INVALID_SEARCH_CONFIG');
    const symptoms=symptomSubjects(question);
    const terms=symptoms.length?symptoms:queryTerms(query); const candidates=new Set<string>();
    const contextTerms=symptoms.length?queryTerms(query).filter(term=>!symptoms.includes(term)):[];
    const topics=terms.filter(term=>medicineTopics.has(term));
    const subjects=topics.length?terms.filter(term=>!medicineTopics.has(term)):[];
    const subject=subjects[0];
    for(const term of terms) {
      if(term.length<2){for(const c of this.chunks)candidates.add(c.id);continue;}
      for(const id of this.postings.get(term.slice(0,2))??[]) candidates.add(id);
    }
    if(queryVector) for(const [id,v] of Object.entries(this.state.vectors)) if(v.profile===queryVector.profile)candidates.add(id);
    const scored:Hit[]=[];
    for(const id of candidates) {
      const c=this.state.chunks[id];if(!c)continue; const d:MedicalDocument=this.state.documents[c.documentId]!;
      if(!hasChunkPermission(d,c,'local_search'))continue;
      const quote = isKdcaDocument(d) ? kdcaQuoteForQuestion(d,question,c) : c.text;
      if(quote===null)continue;
      const body=normalize(`${d.title} ${c.text}`);
      // Symptom questions may use matching health topics, never a medicine leaflet
      // that happens to mention pain. Pending/revoked documents are still excluded.
      if(symptoms.length && (d.category!=='disease'||!symptoms.some(term=>normalize(d.title).includes(term))))continue;
      // A matching generic topic must not answer a question about an absent
      // product using a different medicine's leaflet, even with a high score.
      if(subject&&['medicine','medication'].includes(d.category)&&!normalize(d.title).startsWith(subject))continue;
      if(topics.length&&['medicine','medication'].includes(d.category)
        &&(!topics.every(term=>body.includes(term))||!subjects.every(term=>body.includes(term))))continue;
      const lexical=terms.filter(t=>body.includes(t)).length/Math.max(1,terms.length);
      const stored=this.state.vectors[id];
      const vector=queryVector && stored?.profile===queryVector.profile?cosine(queryVector.values,stored.values):null;
      if(lexical<cfg.minKeyword && (vector===null || vector<cfg.minVector))continue;
      const context=contextTerms.filter(term=>normalize(c.text).includes(term)).length/Math.max(1,contextTerms.length);
      const score=queryVector?0.55*lexical+0.45*Math.max(0,vector??0):symptoms.length?0.8*lexical+0.2*context:lexical;
      scored.push({documentId:d.id,chunkId:id,title:d.title,publisher:d.publisher,sourceUrl:d.sourceUrl,updatedAt:d.updatedAt,version:d.version,text:hasPermission(d,'quotation')?quote:'',score,keywordScore:lexical,vectorScore:vector,attribution:sourceAttribution(d)});
    }
    scored.sort((a,b)=>b.score-a.score || a.chunkId.localeCompare(b.chunkId));
    const hits:Hit[]=[]; const seen=new Set<string>();
    for(const h of scored){const key=`${h.documentId}:${normalize(h.text)}`;if(!seen.has(key)){seen.add(key);hits.push(h);}if(hits.length===cfg.limit)break;}
    return {status:hits.length?'ok' as const:'insufficient_evidence' as const,hits,...(hits.length?{}:{message:insufficientEvidenceMessage})};
  }
}
