import { readFile } from 'node:fs/promises';
import { createKdcaTestTarget, previewKdcaRegistration, registerReviewedKdca, type KdcaReview, type KdcaReviewMode } from './kdca-registration.js';
// No .env, network, automatic source discovery or implicit approval.
try{
  const [mode,...args]=process.argv.slice(2);
  if(mode==='init-test'&&args.length===1){console.log(JSON.stringify({directory:await createKdcaTestTarget(args[0]!)}));}
  else if(mode==='preview'&&args.length===4&&['synthetic','official'].includes(args[3]!)){
    console.log(JSON.stringify(await previewKdcaRegistration(args[0]!,args[1]!,args[2]!,args[3] as KdcaReviewMode),null,2));
  }else if(mode==='register'&&args.length===4&&args[3]==='--approve-registration'){
    const review=JSON.parse(await readFile(args[2]!,'utf8')) as KdcaReview;
    console.log(JSON.stringify(await registerReviewedKdca(args[0]!,args[1]!,review)));
  }else throw Error('KDCA_REGISTRATION_ARGUMENTS_REQUIRED');
}catch(error){
  const code=error instanceof Error&&/^(?:KDCA|REGISTRATION)_[A-Z_]+$/.test(error.message)?error.message:'KDCA_REGISTRATION_FAILED';
  console.error(JSON.stringify({status:'not-registered',error:code}));process.exitCode=1;
}
