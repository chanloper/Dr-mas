import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRagServer,localChat,supabaseVerifier } from './http-api.js';
import { LocalRepository } from './repository.js';
try {
 // Node preserves values already present in the process environment.
 try{loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const verify=supabaseVerifier(process.env.SUPABASE_URL??'',process.env.SUPABASE_PUBLISHABLE_KEY??'');
 const port=Number(process.env.RAG_PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw new Error();
 const repo=new LocalRepository(resolve(fileURLToPath(new URL('../data/local',import.meta.url))));
 // Device verification is complete. Runtime observation is disabled even if
 // an old shell or private .env still supplies the temporary switch.
 delete process.env.RAG_OBSERVE_ONCE;
 const server=createRagServer({verify,chat:q=>localChat(repo,q),origins:(process.env.RAG_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean)});
 server.on('error',()=>{console.error('RAG_SERVER_START_FAILED');process.exitCode=1;});
 server.listen(port,process.env.RAG_HOST??'127.0.0.1',()=>console.log('RAG_SERVER_READY_LOCAL_EVIDENCE_ONLY'));
}catch{console.error('RAG_SERVER_CONFIG_INVALID');process.exitCode=1;}
