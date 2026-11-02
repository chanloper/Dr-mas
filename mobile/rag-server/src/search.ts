export const insufficientEvidenceMessage='확인된 자료가 부족하여 답변할 수 없습니다';
import { normalize, type MedicalDocument, type State, type Chunk } from './model.js';
export interface Hit { documentId:string; chunkId:string; title:string; publisher:string; sourceUrl:string; updatedAt:string|null; version:number; text:string; score:number; keywordScore:number; vectorScore:number|null }
export interface SearchOptions { limit:number; minKeyword:number; minVector:number }
export const defaults:SearchOptions={limit:5,minKeyword:0.2,minVector:0.75}; // Provisional: calibrate using an independent evaluation set.
export function tokens(text:string):string[] { return [...new Set(normalize(text).match(/[\p{L}\p{N}]+/gu)??[])]; }
export function cosine(a:number[],b:number[]):number {
  if(a.length!==b.length || !a.length || !a.every(Number.isFinite)||!b.every(Number.isFinite)) throw new Error('INVALID_VECTOR');
  const norm=Math.hypot(...a)*Math.hypot(...b); return norm?a.reduce((sum,v,i)=>sum+v*b[i]!,0)/norm:0;
}
export class SearchIndex {
  private postings=new Map<string,Set<string>>(); private chunks:Chunk[];
  constructor(private state:State) {
    this.chunks=Object.values(state.chunks);
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
    const terms=tokens(query); const candidates=new Set<string>();
    for(const term of terms) {
      if(term.length<2){for(const c of this.chunks)candidates.add(c.id);continue;}
      for(const id of this.postings.get(term.slice(0,2))??[]) candidates.add(id);
    }
    if(queryVector) for(const [id,v] of Object.entries(this.state.vectors)) if(v.profile===queryVector.profile)candidates.add(id);
    const scored:Hit[]=[];
    for(const id of candidates) {
      const c=this.state.chunks[id]!; const d:MedicalDocument=this.state.documents[c.documentId]!;
      const body=normalize(`${d.title} ${c.text}`);
      const lexical=terms.filter(t=>body.includes(t)).length/Math.max(1,terms.length);
      const stored=this.state.vectors[id];
      const vector=queryVector && stored?.profile===queryVector.profile?cosine(queryVector.values,stored.values):null;
      if(lexical<cfg.minKeyword && (vector===null || vector<cfg.minVector))continue;
      const score=queryVector?0.55*lexical+0.45*Math.max(0,vector??0):lexical;
      scored.push({documentId:d.id,chunkId:id,title:d.title,publisher:d.publisher,sourceUrl:d.sourceUrl,updatedAt:d.updatedAt,version:d.version,text:c.text,score,keywordScore:lexical,vectorScore:vector});
    }
    scored.sort((a,b)=>b.score-a.score || a.chunkId.localeCompare(b.chunkId));
    const hits:Hit[]=[]; const seen=new Set<string>();
    for(const h of scored){const key=`${h.documentId}:${normalize(h.text)}`;if(!seen.has(key)){seen.add(key);hits.push(h);}if(hits.length===cfg.limit)break;}
    return {status:hits.length?'ok' as const:'insufficient_evidence' as const,hits,...(hits.length?{}:{message:insufficientEvidenceMessage})};
  }
}
