import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LocalRepository } from './repository.js';
import { GeminiProvider } from './gemini.js';
import { runSemanticTrial, TransientRepository, mockSemanticProvider } from './semantic-trial.js';
const live=process.argv.includes('--live');let key='';
try {
 if(live&&!process.argv.includes('--approve-3-calls'))throw new Error('EXPLICIT_THREE_CALL_APPROVAL_REQUIRED');
 if(live){
   if(process.stdin.isTTY)throw new Error('USE_SECURE_WRAPPER');
   for await(const chunk of process.stdin){key+=chunk.toString();if(key.length>1024)throw new Error('KEY_INPUT_REQUIRED');}
   key=key.trim();if(!key||key.length>512)throw new Error('KEY_INPUT_REQUIRED');
   const directory=resolve('data/semantic-live');await mkdir(directory,{recursive:true});
   const reservation=await open(resolve(directory,'attempt.json'),'wx').catch(()=>{throw new Error('SEMANTIC_TRIAL_ALREADY_RESERVED');});
   try{await reservation.writeFile(JSON.stringify({maxCalls:3,attempts:1,reservedAt:new Date().toISOString()}));}finally{await reservation.close();}
   const result=await runSemanticTrial(new LocalRepository(directory),new GeminiProvider(key,undefined,{timeout:10000}),'live');
   await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2),'utf8');
   console.log(JSON.stringify(result,null,2));if(!result.semanticSearchPassed)process.exitCode=2;
 }else{
   const result=await runSemanticTrial(new TransientRepository(),mockSemanticProvider(),'mock');
   console.log(JSON.stringify(result,null,2));if(!result.semanticSearchPassed)process.exitCode=2;
 }
}catch(e){
 const safe=['EXPLICIT_THREE_CALL_APPROVAL_REQUIRED','USE_SECURE_WRAPPER','KEY_INPUT_REQUIRED','SEMANTIC_TRIAL_ALREADY_RESERVED','SEMANTIC_STORE_MUST_BE_EMPTY','SEMANTIC_INPUT_BUDGET','SEMANTIC_FIXTURE_HAS_KEYWORD_MATCH','SEMANTIC_INDEX_INCOMPLETE','USAGE_BUDGET_EXCEEDED'];
 const error=e instanceof Error&&safe.includes(e.message)?e.message:'SEMANTIC_TRIAL_FAILED_NO_AUTOMATIC_RETRY';
 console.error(JSON.stringify({mode:live?'live':'mock',mock:!live,status:'not_verified',actualEmbeddingCalls:live?'unknown-on-failure':0,error}));process.exitCode=1;
}finally{key='';}
