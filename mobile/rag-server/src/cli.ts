import { readJsonUtf8 } from './encoding.js';
import { normalize } from './model.js';
import { resolve } from 'node:path';
import { LocalRepository, register, removeDocument } from './repository.js';
import { SearchIndex, defaults } from './search.js';
import { GeminiProvider, GuardedProvider, indexDocuments } from './gemini.js';
import { answer, routeSafety } from './answer.js';
import { embeddingProfile } from './gemini.js';
const [command,...args]=process.argv.slice(2);
const repo=new LocalRepository(resolve('data/local'));
const flags=new Set(args.filter(x=>x.startsWith('--')));const positional=args.filter(x=>!x.startsWith('--'));
const search={...defaults,minKeyword:Number(process.env.SEARCH_MIN_KEYWORD??defaults.minKeyword),minVector:Number(process.env.SEARCH_MIN_VECTOR??defaults.minVector)};
try {
 if(command==='import') {
   if(!positional[0])throw new Error('JSON_FILE_REQUIRED');
   const parsed:unknown=await readJsonUtf8(positional[0]);
   for(const d of Array.isArray(parsed)?parsed:[parsed])console.log(JSON.stringify(await register(repo,d)));
 } else if(command==='search') {
   const question=positional.join(' ');
   if(flags.has('--live')){
     if(!flags.has('--public-question'))throw new Error('PUBLIC_NONPERSONAL_QUESTION_REQUIRED');
     if(routeSafety(question))console.log(JSON.stringify(await answer(repo,question),null,2));
     else {
       if(!question.trim()||question.length>2000)throw new Error('INVALID_QUERY');
       const api=new GuardedProvider(repo,new GeminiProvider());const state=await repo.read();
       for(const [id,c] of Object.entries(state.chunks))if(state.documents[c.documentId]?.rights.permission!=='permitted'){delete state.chunks[id];delete state.vectors[id];}
       const values=Object.keys(state.chunks).length?await api.embed(normalize(question),'RETRIEVAL_QUERY'):undefined;
       console.log(JSON.stringify(new SearchIndex(state).search(question,search,values?{profile:embeddingProfile,values}:undefined),null,2));
     }
   }else console.log(JSON.stringify(new SearchIndex(await repo.read()).search(question,search),null,2));
 } else if(command==='ask') {
   const question=positional.join(' ');const live=flags.has('--live')&&!routeSafety(question);
   if(live&&!flags.has('--public-question'))throw new Error('PUBLIC_NONPERSONAL_QUESTION_REQUIRED');
   if(live&&!process.env.GEMINI_GENERATION_MODEL?.trim())throw new Error('GEMINI_GENERATION_MODEL_REQUIRED');
   const api=live?new GuardedProvider(repo,new GeminiProvider()):undefined;
   console.log(JSON.stringify(await answer(repo,question,{api,publicQuestion:flags.has('--public-question'),search}),null,2));
 } else if(command==='index') {
   if(!flags.has('--live'))throw new Error('LIVE_FLAG_REQUIRED');
   console.log(JSON.stringify(await indexDocuments(repo,new GuardedProvider(repo,new GeminiProvider()))));
 } else if(command==='reindex') {
   if(!positional[0])throw new Error('DOCUMENT_ID_REQUIRED');
   await repo.transaction(s=>{for(const [id,c] of Object.entries(s.chunks))if(c.documentId===positional[0])delete s.vectors[id];if(flags.has('--fresh'))s.embeddingCache={};});
   console.log(JSON.stringify({status:'pending',next:'index --live'}));
 } else if(command==='delete') {
   if(!positional[0])throw new Error('DOCUMENT_ID_REQUIRED');console.log(JSON.stringify(await removeDocument(repo,positional[0])));
 } else if(command==='status') {
   const s=await repo.read();console.log(JSON.stringify({documents:Object.keys(s.documents).length,chunks:Object.keys(s.chunks).length,vectors:Object.keys(s.vectors).length,usage:s.usage},null,2));
 } else throw new Error('USAGE');
} catch(e) {
 const safe=new Set(['GEMINI_API_KEY_REQUIRED','GEMINI_GENERATION_MODEL_REQUIRED','PUBLIC_NONPERSONAL_QUESTION_REQUIRED','LIVE_FLAG_REQUIRED','INVALID_QUERY','INVALID_SEARCH_CONFIG','USAGE_BUDGET_EXCEEDED','API_TIMEOUT','API_CALL_FAILED','DOCUMENT_ID_REQUIRED','JSON_FILE_REQUIRED','USAGE','INVALID_UTF8_INPUT','TEXT_ENCODING_REVIEW_REQUIRED']);
 const message=e instanceof Error&&safe.has(e.message)?e.message:'COMMAND_FAILED: check input/configuration; raw errors suppressed';
 console.error(message);process.exitCode=1;
}
