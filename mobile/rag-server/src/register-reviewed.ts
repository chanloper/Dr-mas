import {fileURLToPath} from 'node:url';
import {LocalRepository} from './repository.js';
import {previewRegistration,executeRegistration,mfdsRegistrationTarget} from './registration.js';
import {parseRegistrationArguments} from './registration-args.js';
// No .env, SDK, fetch, source acquisition or recursive import.
try{
 const {args,binding}=parseRegistrationArguments(process.argv.slice(2),mfdsRegistrationTarget);
 // Optional exact binding for another explicitly reviewed staged document.
 // The legacy fixed single-document invocation remains unchanged.
 const mode=args[0];
 const source=new LocalRepository(fileURLToPath(new URL('../data/mfds-scale-20/rag/',import.meta.url)));
 const target=new LocalRepository(fileURLToPath(new URL('../data/local/',import.meta.url)));
 if(mode==='dry-run'&&args.length===1){
  console.log(JSON.stringify(await previewRegistration(source,target,binding),null,2));
 }else if(mode==='execute'&&args.length===5&&args[1]==='--approve-single-document'&&args[2]?.startsWith('--reviewer=')&&args[3]?.startsWith('--destination-fingerprint=')&&args[4]?.startsWith('--source-fingerprint=')){
  const plan=await previewRegistration(source,target,binding);
  if(plan.destinationFingerprint!==args[3].slice('--destination-fingerprint='.length))throw Error('REGISTRATION_DESTINATION_CHANGED');
  if(plan.sourceFingerprint!==args[4].slice('--source-fingerprint='.length))throw Error('REGISTRATION_SOURCE_CHANGED');
  const result=await executeRegistration(source,target,plan,{confirmed:true,reviewer:args[2].slice('--reviewer='.length),reviewedAt:new Date().toISOString()});
  console.log(JSON.stringify(result));
 }else throw Error('REGISTRATION_FINAL_APPROVAL_REQUIRED');
}catch(error){
 const code=error instanceof Error&&/^REGISTRATION_[A-Z_]+$/.test(error.message)?error.message:'REGISTRATION_FAILED';
 console.error(JSON.stringify({status:'not-registered',error:code}));process.exitCode=1;
}
