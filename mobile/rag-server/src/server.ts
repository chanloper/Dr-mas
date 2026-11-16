import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRagServer,supabaseVerifier } from './http-api.js';
import { kdcaHomeItems } from './kdca-use.js';
import { groundedChat } from './grounded-chat.js';
import { LocalRepository } from './repository.js';
import { restoreCorpus } from './restore-corpus.js';
import { createSyntheticChat } from './synthetic-chat.js';
import { createHiraReferenceHandler } from './hira-handler.js';
try {
 // Node preserves values already present in the process environment.
 try{loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const verify=supabaseVerifier(process.env.SUPABASE_URL??'',process.env.SUPABASE_PUBLISHABLE_KEY??'');
 const port=Number(process.env.RAG_PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw new Error();
 const repo=new LocalRepository(resolve(fileURLToPath(new URL('../data/local',import.meta.url))));
 const corpusMode=process.env.RAG_CORPUS_MODE??'local';
 if(!['local','synthetic'].includes(corpusMode))throw new Error('INVALID_CORPUS_MODE');
 if(corpusMode==='local')console.info(JSON.stringify(await restoreCorpus(repo,process.env)));
 // Health conversations never instantiate an external provider, even when an
 // existing shell supplies a key and model. Non-medical copy work is a separate,
 // explicitly approved development task; credentials are not consent.
 const chat=corpusMode==='synthetic'?await createSyntheticChat(process.env.NODE_ENV):(q:string,signal:AbortSignal)=>groundedChat(repo,q,signal,undefined,
  timing=>console.info(JSON.stringify({event:'RAG_LOCAL_SEARCH_TIMING',...timing})));
 // Device verification is complete. Runtime observation is disabled even if
 // an old shell or private .env still supplies the temporary switch.
 delete process.env.RAG_OBSERVE_ONCE;
 const server=createRagServer({verify,chat,healthInfo:corpusMode==='local'?async()=>({items:kdcaHomeItems(await repo.read())}):undefined,reference:corpusMode==='local'?createHiraReferenceHandler(process.env.DATA_GO_KR_SERVICE_KEY):undefined,origins:(process.env.RAG_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean),
  observeTiming:timing=>console.info(JSON.stringify({event:'RAG_HTTP_TIMING',...timing}))});
 server.on('error',(error:NodeJS.ErrnoException)=>{
  // Fixed codes only: never print environment values, keys or raw error objects.
  const code=['EADDRNOTAVAIL','EADDRINUSE','EACCES'].includes(error.code??'')?error.code:'UNKNOWN';
  console.error(`RAG_SERVER_START_FAILED ${code}`);process.exitCode=1;
 });
 server.listen(port,process.env.RAG_HOST??'127.0.0.1',()=>console.log('RAG_SERVER_READY_LOCAL_EVIDENCE_ONLY'));
}catch(error){
 const status=error instanceof Error&&/^RAG_RESTORE_(?:CONFIG_INVALID|INVALID|WRITE_FAILED)$/.test(error.message)?error.message:'RAG_SERVER_CONFIG_INVALID';
 console.error(JSON.stringify({status,documents:0}));process.exitCode=1;
}
