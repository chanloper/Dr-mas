import { batchPlan, batchStatus, runBatch, verifyBatch } from './ingestion/batch.js';
import { MfdsError, safeMfdsCode } from './ingestion/http.js';

const [command,...args]=process.argv.slice(2);
try {
  const flags=new Map<string,string>();
  for(const arg of args) {
    const match=/^--(max-rows|pages|approve-live|portal-approved)(?:=(\d+))?$/.exec(arg);
    if(!match||flags.has(match[1]!))throw new MfdsError('MFDS_INVALID_ARGUMENTS');
    flags.set(match[1]!,match[2]??'true');
  }
  const maxRows=Number(flags.get('max-rows'));const plan=batchPlan(maxRows);
  if(command==='preflight'&&flags.size===1)console.log(JSON.stringify({networkRequests:0,...plan,permission:'pending',geminiEnabled:false},null,2));
  else if(command==='status'&&flags.size===1)console.log(JSON.stringify(await batchStatus(maxRows),null,2));
  else if(command==='verify'&&flags.size===1)console.log(JSON.stringify(await verifyBatch(maxRows),null,2));
  else if(command==='collect')console.log(JSON.stringify(await runBatch({maxRows,pagesThisRun:flags.has('pages')?Number(flags.get('pages')):undefined,approved:flags.get('approve-live')==='true',portalApproved:flags.get('portal-approved')==='true'}),null,2));
  else throw new MfdsError('MFDS_USAGE_PREFLIGHT_STATUS_COLLECT_VERIFY');
}catch(error){console.error(safeMfdsCode(error));process.exitCode=1;}
