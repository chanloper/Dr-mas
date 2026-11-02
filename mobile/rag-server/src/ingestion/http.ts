import { setTimeout as sleep } from 'node:timers/promises';
import { decodeUtf8 } from '../encoding.js';
import { easyAdapter, easyRequest, parseEasy, type SourceAdapter } from './mfds.js';

export class MfdsError extends Error {
  constructor(public readonly code:string) { super(code); this.name='MfdsError'; }
}
export interface HttpPolicy { timeoutMs:number; maxAttempts:number; intervalMs:number; maxBytes:number }
export const pilotPolicy:Readonly<HttpPolicy>=Object.freeze({timeoutMs:10000,maxAttempts:3,intervalMs:1100,maxBytes:2_000_000});
export interface HttpOptions {
  approved?:boolean; env?:NodeJS.ProcessEnv; fetch?:typeof globalThis.fetch;
  policy?:Partial<HttpPolicy>; signal?:AbortSignal;
}
const knownCodes=new Set(['01','04','05','10','12','20','22','23','29','30','31']);
const transientCodes=new Set(['01','05','23']);
function apiCode(text:string):string|undefined {
  let code:unknown;
  try {
    const json=JSON.parse(text);code=(json?.response??json)?.header?.resultCode;
  } catch {
    // Gateway errors may be XML even for type=json. Extract only a numeric code.
    code=/<(?:returnReasonCode|resultCode)>\s*(\d{1,2})\s*<\//i.exec(text)?.[1];
  }
  if(typeof code==='number')code=String(code).padStart(2,'0');
  if(typeof code!=='string')return undefined;
  const padded=code.padStart(2,'0');return padded==='00'||knownCodes.has(padded)?padded:'UNKNOWN';
}
async function boundedBody(response:Response,limit:number,signal:AbortSignal):Promise<Uint8Array> {
  const length=response.headers.get('content-length');
  if(length!==null&&Number(length)>limit)throw new MfdsError('MFDS_RESPONSE_TOO_LARGE');
  if(!response.body)throw new MfdsError('MFDS_EMPTY_RESPONSE');
  const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try {
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>limit)throw new MfdsError('MFDS_RESPONSE_TOO_LARGE');
      parts.push(value);
    }
  } finally { signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock(); }
  const result=new Uint8Array(size);let offset=0;
  for(const part of parts){result.set(part,offset);offset+=part.byteLength;}
  return result;
}
export function safeMfdsCode(error:unknown):string {
  return error instanceof MfdsError?error.code:'MFDS_OPERATION_FAILED';
}
/** HTTPS URL contains the required query key only inside fetch. No request URL is returned.
 * One logical page only; redirects, subsequent pages and calls after failure are blocked.
 */
export function createPilotHttpAdapter(options:HttpOptions={}):SourceAdapter & {attempts():number} {
  if(options.approved!==true)throw new MfdsError('LIVE_MAX_5_APPROVAL_REQUIRED');
  return createLimitedHttpAdapter(options,{maxPage:1,pageSize:5,once:true});
}
export interface HttpScope {
  maxPage:number; pageSize:number; once?:boolean;
  beforeAttempt?:(page:number)=>Promise<number>;
  afterAttempt?:()=>Promise<void>;
}
/** Shared transport; multi-page callers must supply a durable attempt reservation. */
export function createLimitedHttpAdapter(options:HttpOptions,scope:HttpScope):SourceAdapter & {attempts():number} {
  if(options.approved!==true)throw new MfdsError('MFDS_SCOPE_APPROVAL_REQUIRED');
  if(!Number.isInteger(scope.maxPage)||scope.maxPage<1||scope.maxPage>5||!Number.isInteger(scope.pageSize)||scope.pageSize<1||scope.pageSize>10||(!scope.once&&!scope.beforeAttempt))throw new MfdsError('MFDS_INVALID_SCOPE');
  const policy={...pilotPolicy,...options.policy};
  for(const value of Object.values(policy))if(!Number.isInteger(value)||value<1)throw new MfdsError('MFDS_INVALID_POLICY');
  if(policy.maxAttempts>3||policy.timeoutMs>10000||policy.intervalMs<1100||policy.intervalMs>10000||policy.maxBytes>2_000_000)throw new MfdsError('MFDS_INVALID_POLICY');
  const env=options.env??process.env;
  const serviceKey=env.DATA_GO_KR_SERVICE_KEY;
  if(!serviceKey?.trim())throw new MfdsError('DATA_GO_KR_SERVICE_KEY_REQUIRED');
  // Keep an immutable private key snapshot. Never retain the caller's environment object.
  const secrets=[serviceKey,encodeURIComponent(serviceKey),new URLSearchParams({k:serviceKey}).toString().slice(2)];
  const fetcher=options.fetch??globalThis.fetch;
  let used=false,calls=0,lastStart=0;
  const adapter=easyAdapter(async(page,rows)=>{
    if((scope.once&&used)||!Number.isInteger(page)||page<1||page>scope.maxPage||!Number.isInteger(rows)||rows<1||rows>scope.pageSize||(!scope.once&&rows!==scope.pageSize))throw new MfdsError('MFDS_PILOT_LIMIT');
    used=true;
    let retryDelay=0;
    for(let attempt=0;attempt<policy.maxAttempts;attempt++) {
      if(options.signal?.aborted)throw new MfdsError('MFDS_ABORTED');
      const notBefore=scope.beforeAttempt?await scope.beforeAttempt(page):0;
      const wait=Math.max(retryDelay,lastStart?policy.intervalMs-(Date.now()-lastStart):0,notBefore-Date.now());
      if(wait>0)try{await sleep(wait,undefined,{signal:options.signal});}catch{throw new MfdsError('MFDS_ABORTED');}
      const controller=new AbortController();
      const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
      let timer:ReturnType<typeof setTimeout>|undefined;
      let retry=false;
      try {
        const operation=async()=>{
          const request=easyRequest(page,rows,{}, {DATA_GO_KR_SERVICE_KEY:serviceKey});
          const response=await fetcher(request.url,{method:request.method,redirect:'error',credentials:'omit',cache:'no-store',headers:{accept:'application/json'},signal:controller.signal});
          // Block URL/credential echoes before any response can reach disk or a parser.
          const bytes=await boundedBody(response,policy.maxBytes,controller.signal);
          let text:string;try{text=decodeUtf8(bytes);}catch{throw new MfdsError('MFDS_INVALID_UTF8');}
          let canonical=text;
          try{canonical=JSON.stringify(JSON.parse(text));}catch{ /* XML gateway errors are inspected as text. */ }
          if(secrets.some(secret=>text.includes(secret)||canonical.includes(secret)))throw new MfdsError('MFDS_SECRET_ECHO_BLOCKED');
          const code=apiCode(text);
          if(code&&code!=='00')throw new MfdsError(`MFDS_API_${code}`);
          if(!response.ok)throw new MfdsError(response.status===429?'MFDS_HTTP_429':response.status>=500&&response.status<=599?'MFDS_HTTP_5XX':response.status===401||response.status===403?'MFDS_HTTP_AUTH':'MFDS_HTTP_ERROR');
          const charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(response.headers.get('content-type')??'')?.[1];
          if(charset&&!/^utf-?8$/i.test(charset))throw new MfdsError('MFDS_NON_UTF8_CHARSET');
          try{const parsed=parseEasy(bytes);if(parsed.items.length>rows||parsed.pageNo!==page||parsed.numOfRows!==rows)throw new Error();}
          catch{throw new MfdsError('MFDS_INVALID_RESPONSE');}
          return bytes;
        };
        lastStart=Date.now();calls++;
        return await Promise.race([operation(),new Promise<never>((_,reject)=>{
          timer=setTimeout(()=>{controller.abort();reject(new MfdsError('MFDS_TIMEOUT'));},policy.timeoutMs);
          if(options.signal)controller.signal.addEventListener('abort',()=>reject(new MfdsError(options.signal?.aborted?'MFDS_ABORTED':'MFDS_TIMEOUT')),{once:true});
        })]);
      } catch(error) {
        const safe=error instanceof MfdsError?error:new MfdsError(options.signal?.aborted?'MFDS_ABORTED':'MFDS_NETWORK_ERROR');
        retry=['MFDS_HTTP_429','MFDS_HTTP_5XX',...[...transientCodes].map(c=>`MFDS_API_${c}`)].includes(safe.code);
        if(!retry||attempt+1>=policy.maxAttempts)throw safe;
        retryDelay=Math.min(4000,500*2**attempt);
      } finally {
        if(timer)clearTimeout(timer);controller.abort();options.signal?.removeEventListener('abort',abort);
        await scope.afterAttempt?.();
      }
    }
    throw new MfdsError('MFDS_RETRY_EXHAUSTED');
  });
  return {...adapter,attempts:()=>calls};
}
