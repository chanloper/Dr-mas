import { readJsonUtf8 } from './encoding.js';
import { SearchIndex } from './search.js';
import { LocalRepository } from './repository.js';
interface Case { question:string; expectedDocumentIds:string[] }
const file=process.argv[2];if(!file)throw new Error('USAGE: npm run eval -- questions.json [store-path]');
const cases=await readJsonUtf8(file) as Case[];
const state=await new LocalRepository(process.argv[3]??'data/local').read();
const index=new SearchIndex(state);let known=0,hit=0,unknown=0,abstained=0,trueAbstained=0,sources=0,matched=0;
const start=performance.now();
for(const c of cases){
 const r=index.search(c.question,{minKeyword:Number(process.env.SEARCH_MIN_KEYWORD??0.2)});
 if(c.expectedDocumentIds.length){known++;if(r.hits.some(h=>c.expectedDocumentIds.includes(h.documentId)))hit++;}else unknown++;
 if(!r.hits.length){abstained++;if(!c.expectedDocumentIds.length)trueAbstained++;}
 for(const h of r.hits){sources++;if(state.documents[h.documentId]?.sourceUrl===h.sourceUrl)matched++;}
}
console.log(JSON.stringify({cases:cases.length,retrievalHitAt5:known?hit/known:null,sourceMetadataConsistency:sources?matched/sources:null,abstentionRecall:unknown?trueAbstained/unknown:null,abstentionPrecision:abstained?trueAbstained/abstained:null,totalMs:performance.now()-start,scope:'local keyword only; no Gemini or clinical validation'},null,2));
