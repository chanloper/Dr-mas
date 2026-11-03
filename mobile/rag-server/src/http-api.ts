import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { answer } from './answer.js';
import type { Repository } from './repository.js';
import { hash } from './model.js';
import {hasPermission} from './rights.js';

export const disclaimer='참고용 일반 정보이며 진단·처방이나 의료진의 판단을 대신하지 않습니다.';
export class ApiError extends Error {
 constructor(public status:number,public code:string){super(code);}
}
export function supabaseVerifier(url:string,key:string,transport:typeof fetch=fetch) {
 const target=new URL(url);
 if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!key.startsWith('sb_publishable_'))throw new Error('AUTH_CONFIG_INVALID');
 return async(token:string,signal:AbortSignal)=>{
  let response:Response;
  try {response=await transport(new URL('/auth/v1/user',target),{headers:{apikey:key,Authorization:`Bearer ${token}`},signal,redirect:'error'});}
  catch {throw new ApiError(503,'AUTH_UNAVAILABLE');}
  if(response.status===401||response.status===403)throw new ApiError(401,'UNAUTHORIZED');
  if(!response.ok)throw new ApiError(503,'AUTH_UNAVAILABLE');
  const user=await response.json().catch(()=>null) as {id?:unknown;is_anonymous?:unknown}|null;
  if(typeof user?.id!=='string'||!user.id||user.is_anonymous===true)throw new ApiError(401,'UNAUTHORIZED');
  return user.id;
 };
}
// Public, rights-reviewed corpus only; no patient data, Gemini or writes in HTTP mode.
export async function localChat(repo:Repository,question:string,options:{syntheticDocuments?:ReadonlyMap<string,string>}={}) {
 const state=structuredClone(await repo.read());
 for(const [id,c] of Object.entries(state.chunks)){
  const d=state.documents[c.documentId];
  const eligible=options.syntheticDocuments
   ?d?.rights.permission==='test-only'&&options.syntheticDocuments.get(d.id)===hash(d.content)&&d.content.slice(c.start,c.end)===c.text
   :d?.rights.permission!=='test-only'&&hasPermission(d,'local_search');
  if(!eligible){delete state.chunks[id];delete state.vectors[id];}
 }
 const result=await answer({read:async()=>state,transaction:async()=>{throw new Error('READ_ONLY');}},question);
 const hits=('hits' in result?result.hits:[])??[];
 return {status:result.status,message:result.message,
  disclaimer:options.syntheticDocuments?'합성 테스트 자료입니다. 실제 의료정보나 복약 지침이 아닙니다. '+disclaimer:disclaimer,
  mode:options.syntheticDocuments?'synthetic' as const:'local' as const,
  sources:hits.map(h=>({documentId:h.documentId,chunkId:h.chunkId,title:h.title,sourceUrl:h.attribution?.datasetUrl??h.sourceUrl,quote:h.text,publisher:h.publisher,updatedAt:h.updatedAt,...(h.attribution?{attribution:h.attribution}:{})}))};
}
export function createRagServer(options:{verify:(token:string,signal:AbortSignal)=>Promise<string>;chat:(question:string)=>Promise<Awaited<ReturnType<typeof localChat>>>;origins?:string[];timeoutMs?:number;rateLimit?:number;now?:()=>number;observeOnce?:(result:{httpStatus:number;responseType:string})=>void}) {
 let observationAvailable=!!options.observeOnce;
 const buckets=new Map<string,{count:number;until:number}>();
 const now=options.now??Date.now;
 const allow=(key:string,limit:number)=>{
  const time=now();for(const [id,b]of buckets)if(b.until<=time)buckets.delete(id);
  let b=buckets.get(key);if(!b){if(buckets.size>=10000)return false;b={count:0,until:time+60000};buckets.set(key,b);}
  return ++b.count<=limit;
 };
 const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{
  const controller=new AbortController();let expired=false;
  const reply=(status:number,body:unknown)=>{if(!res.writableEnded&&!res.destroyed){
   if(observationAvailable&&req.method==='POST'&&req.url==='/api/rag/chat'){
    observationAvailable=false;
    const data=body as {status?:unknown;error?:unknown}|null;
    const candidate=status===200?data?.status:data?.error;
    const types=['local_evidence','insufficient_evidence','emergency','professional','privacy','UNAUTHORIZED','AUTH_UNAVAILABLE','ORIGIN_DENIED','JSON_REQUIRED','BODY_TOO_LARGE','RATE_LIMITED','INVALID_INPUT','TIMEOUT','SERVER_ERROR'];
    const responseType=typeof candidate==='string'&&types.includes(candidate)?candidate:'OTHER';
    res.once('finish',()=>{try{options.observeOnce?.({httpStatus:status,responseType});}catch{/* Diagnostics must not affect responses. */}});
   }
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}};
  const timer=setTimeout(()=>{expired=true;controller.abort();reply(504,{error:'TIMEOUT'});req.destroy();},options.timeoutMs??10000);
  res.on('close',()=>controller.abort());
  try {
   const origin=req.headers.origin;
   if(origin){if(!options.origins?.includes(origin))throw new ApiError(403,'ORIGIN_DENIED');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.url!=='/api/rag/chat')throw new ApiError(404,'NOT_FOUND');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');reply(204,null);return;}
   if(req.method!=='POST')throw new ApiError(405,'METHOD_NOT_ALLOWED');
   if(!allow('ip:'+req.socket.remoteAddress,60))throw new ApiError(429,'RATE_LIMITED');
   if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/json')throw new ApiError(415,'JSON_REQUIRED');
   if(Number(req.headers['content-length'])>8192)throw new ApiError(413,'BODY_TOO_LARGE');
   const auth=req.headers.authorization;
   if(!auth||!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(auth))throw new ApiError(401,'UNAUTHORIZED');
   const id=await options.verify(auth.slice(7),controller.signal);
   if(expired)return;
   if(!id)throw new ApiError(401,'UNAUTHORIZED');
   if(!allow('user:'+id,options.rateLimit??10))throw new ApiError(429,'RATE_LIMITED');
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>8192)throw new ApiError(413,'BODY_TOO_LARGE');chunks.push(bytes);}
   let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new ApiError(400,'INVALID_INPUT');}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='question'))throw new ApiError(400,'INVALID_INPUT');
   const question=(input as {question?:unknown}).question;
   if(typeof question!=='string'||!question.trim()||question.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(question))throw new ApiError(400,'INVALID_INPUT');
   if(expired)return;
   const result=await options.chat(question.trim());if(!expired)reply(200,result);
  }catch(error){if(!expired)reply(error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.code:'SERVER_ERROR'});}
  finally{clearTimeout(timer);}
 });
 server.headersTimeout=5000;server.requestTimeout=10000;server.maxHeadersCount=32;
 return server;
}
