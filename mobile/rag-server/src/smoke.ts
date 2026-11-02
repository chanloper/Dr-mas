import { GoogleGenAI } from '@google/genai';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export type SmokeKind='embedding'|'generation';
export const smokeInputs={embedding:'가상성분베타',generation:'가상자료: 베타는 테스트 표식입니다. 표식 이름만 답하세요.'};
export const smokeLimits={maxCalls:1,maxInputCharacters:64,maxOutputTokens:64,timeoutMs:10000,attempts:1} as const;
export function createSmokeClient(key:string) {
 return new GoogleGenAI({apiKey:key,httpOptions:{timeout:smokeLimits.timeoutMs,retryOptions:{attempts:1}}});
}
export async function runSmoke(options:{key:string;kind:SmokeKind;marker:string;generationModel?:string},createClient=createSmokeClient) {
 if(!options.key.trim()||options.key.length>512)throw new Error('KEY_INPUT_REQUIRED');
 if(!['embedding','generation'].includes(options.kind))throw new Error('INVALID_SMOKE_MODE');
 if(options.kind==='generation'&&!options.generationModel?.trim())throw new Error('GEMINI_GENERATION_MODEL_REQUIRED');
 const text=smokeInputs[options.kind];if(text.length>smokeLimits.maxInputCharacters)throw new Error('SMOKE_INPUT_LIMIT');
 await mkdir(dirname(options.marker),{recursive:true});
 // Reserve the entire one-call budget before even constructing the SDK client.
 const marker=await open(options.marker,'wx').catch(()=>{throw new Error('SMOKE_ALREADY_RESERVED_OR_UNAVAILABLE');});
 try {await marker.writeFile(JSON.stringify({kind:options.kind,reservedAt:new Date().toISOString(),maxCalls:1}),'utf8');}finally{await marker.close();}
 const client=createClient(options.key);
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const operation=async()=>{
   if(options.kind==='embedding'){
     const r=await client.models.embedContent({model:'gemini-embedding-001',contents:text,config:{taskType:'RETRIEVAL_QUERY',outputDimensionality:768,abortSignal:controller.signal}});
     const v=r.embeddings?.[0]?.values;
     if(!v||v.length!==768||!v.every(Number.isFinite)||!Math.hypot(...v))throw new Error('INVALID_EMBEDDING');
     return {mode:'live',mock:false,status:'embedding_success',apiCalls:1,model:'gemini-embedding-001',dimensions:v.length,inputCharacters:text.length};
   }
   const r=await client.models.generateContent({model:options.generationModel!,contents:text,config:{abortSignal:controller.signal,maxOutputTokens:smokeLimits.maxOutputTokens,temperature:0}});
   if(!r.text?.trim())throw new Error('EMPTY_RESPONSE');
   // Do not print raw upstream responses, headers, vectors, or errors.
   return {mode:'live',mock:false,status:'generation_success',apiCalls:1,model:options.generationModel!,outputCharacters:r.text.length,maxOutputTokens:smokeLimits.maxOutputTokens};
 };
 try {
   return await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('SMOKE_TIMEOUT'));},smokeLimits.timeoutMs);})]);
 }catch{throw new Error('SMOKE_CALL_FAILED_OR_TIMEOUT: budget remains reserved; no automatic retry');}
 finally{if(timer)clearTimeout(timer);}
}
async function main(){
 let key='';
 try {
   const kind=process.argv[2]??'embedding';
   if(kind!=='embedding'&&kind!=='generation')throw new Error('INVALID_SMOKE_MODE');
   if(process.stdin.isTTY)throw new Error('USE_SECURE_POWERSHELL_WRAPPER');
   for await(const chunk of process.stdin){key+=chunk.toString();if(key.length>1024)throw new Error('KEY_INPUT_REQUIRED');}
   key=key.trim();
   const result=await runSmoke({key,kind,marker:resolve('.smoke/first-attempt.json'),generationModel:process.env.GEMINI_GENERATION_MODEL});
   console.log(JSON.stringify(result));
 }catch(e){
   const safe=['KEY_INPUT_REQUIRED','INVALID_SMOKE_MODE','GEMINI_GENERATION_MODEL_REQUIRED','SMOKE_ALREADY_RESERVED_OR_UNAVAILABLE','USE_SECURE_POWERSHELL_WRAPPER','SMOKE_CALL_FAILED_OR_TIMEOUT: budget remains reserved; no automatic retry'];
   const error=e instanceof Error&&safe.includes(e.message)?e.message:'SMOKE_SETUP_FAILED';
   console.error(JSON.stringify({mode:'live',mock:false,status:'not_verified',error}));process.exitCode=1;
 }finally{key='';}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
