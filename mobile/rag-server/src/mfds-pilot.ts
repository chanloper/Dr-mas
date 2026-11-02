import { pilotPreflight, runPilot, verifyPilot } from './ingestion/pilot.js';
import { MfdsError, safeMfdsCode } from './ingestion/http.js';

const [command,...flags]=process.argv.slice(2);
try {
  if(command==='preflight'&&flags.length===0)console.log(JSON.stringify(pilotPreflight(),null,2));
  else if(command==='verify'&&flags.length===0)console.log(JSON.stringify(await verifyPilot(),null,2));
  else if(command==='collect') {
    if(flags.some(f=>!['--approve-live-max-5','--portal-approved'].includes(f))||new Set(flags).size!==flags.length)throw new MfdsError('MFDS_INVALID_ARGUMENTS');
    console.log(JSON.stringify(await runPilot({approved:flags.includes('--approve-live-max-5'),portalApproved:flags.includes('--portal-approved')}),null,2));
  }else throw new MfdsError('MFDS_USAGE_PREFLIGHT_COLLECT_VERIFY');
}catch(error){console.error(safeMfdsCode(error));process.exitCode=1;}
