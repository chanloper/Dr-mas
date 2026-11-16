import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {LocalRepository,register,type Repository} from './repository.js';
import {emptyState,hash} from './model.js';
import {previewRegistration,executeRegistration} from './registration.js';
import {publicHealthMaterials} from './public-health-materials.js';
// Explicit local-only operator command. No env, fetch, SDK or external AI.
async function main(){
 if(process.argv.slice(2).join(' ')!=='--approve-reviewed-public-text')throw Error('PUBLIC_TEXT_APPROVAL_REQUIRED');
 const directory=fileURLToPath(new URL('../data/local/',import.meta.url));
 const target=new LocalRepository(directory),before=await target.read();
 const backup=join(directory,'backups');await mkdir(backup,{recursive:true});
 const path=join(backup,`before-public-text-${Date.now()}.json`),raw=JSON.stringify(before);
 await writeFile(path,raw,{encoding:'utf8',flag:'wx'});
 if(hash(await readFile(path,'utf8'))!==hash(raw))throw Error('BACKUP_VERIFICATION_FAILED');
 for(const input of publicHealthMaterials()){
  const current=await target.read();
  if(current.documents[input.id]){
   if(current.documents[input.id]!.contentHash!==hash(input.content))throw Error('PUBLIC_TEXT_ALREADY_CHANGED');
   console.log(JSON.stringify({documentId:input.id,status:'already-present'}));continue;
  }
  const staged=emptyState();const source:Repository={read:async()=>structuredClone(staged),transaction:async fn=>fn(staged)};
  await register(source,input);const doc=staged.documents[input.id]!;
  const plan=await previewRegistration(source,target,{documentId:doc.id,version:doc.version,contentHash:doc.contentHash});
  const result=await executeRegistration(source,target,plan,{confirmed:true,reviewer:'Codex public-license review; clinical review pending',reviewedAt:new Date().toISOString()});
  console.log(JSON.stringify(result));
 }
 const after=await target.read();
 for(const [id,doc]of Object.entries(before.documents))if(JSON.stringify(after.documents[id])!==JSON.stringify(doc))throw Error('EXISTING_DOCUMENT_CHANGED');
 console.log(JSON.stringify({existingDocumentsPreserved:true,documentsBefore:Object.keys(before.documents).length,documentsAfter:Object.keys(after.documents).length,externalCalls:0}));
}
main().catch(()=>{console.error('PUBLIC_TEXT_REGISTRATION_FAILED');process.exitCode=1;});
