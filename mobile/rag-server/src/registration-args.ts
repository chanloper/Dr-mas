import type {RegistrationBinding} from './registration.js';

export function parseRegistrationArguments(input:readonly string[],fallback:RegistrationBinding){
 const args=[...input];let binding=fallback;
 const selected=args.filter(arg=>/^--(?:document-id|version|content-hash)=/.test(arg));
 if(selected.length){
  if(selected.length!==3||new Set(selected.map(arg=>arg.split('=')[0])).size!==3)throw Error('REGISTRATION_EXACT_BINDING_REQUIRED');
  const documentId=selected.find(arg=>arg.startsWith('--document-id='))!.slice('--document-id='.length);
  const version=Number(selected.find(arg=>arg.startsWith('--version='))!.slice('--version='.length));
  const contentHash=selected.find(arg=>arg.startsWith('--content-hash='))!.slice('--content-hash='.length);
  if(!/^mfds-easy-\d{1,30}$/.test(documentId)||version!==1||!/^[a-f0-9]{64}$/.test(contentHash))throw Error('REGISTRATION_EXACT_BINDING_REQUIRED');
  binding={documentId,version,contentHash};
  for(let i=args.length-1;i>=0;i--)if(selected.includes(args[i]!))args.splice(i,1);
 }
 return {args,binding};
}
