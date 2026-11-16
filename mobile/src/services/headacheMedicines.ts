import type { RagReply, RagSource } from './ragClient';

export function headacheMedicineQuestion(question: string): boolean {
  return ['머리가아파요','머리아파요','머리가아픕니다','두통'].includes(question.replace(/[\s.!。]/gu,''));
}
export function validateHeadacheMedicines(input: unknown): RagSource[] {
  const value=input as {status?:unknown;symptom?:unknown;checkedAt?:unknown;sources?:unknown};
  if(value?.status!=='reference_only'||value.symptom!=='두통'||typeof value.checkedAt!=='string'
    ||!Number.isFinite(Date.parse(value.checkedAt))||Date.parse(value.checkedAt)>Date.now()
    ||Date.now()-Date.parse(value.checkedAt)>300000||!Array.isArray(value.sources)||value.sources.length>4)throw Error('INVALID_RESPONSE');
  const sources=value.sources as RagSource[];
  for(const [index,source]of sources.entries()) {
    if(!source||!/^mfds-otc-\d{9}$/.test(source.documentId)||source.chunkId!==`${source.documentId}:${index}`
      ||source.sourceUrl!=='https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq='+source.documentId.slice('mfds-otc-'.length)||source.publisher!=='식품의약품안전처'
      ||typeof source.title!=='string'||!source.title||source.title.length>250||/[<>\u0000-\u001f]/u.test(source.title)
      ||typeof source.quote!=='string'||!source.quote||source.quote.length>4000||/[<>\u0000-\u0008]/u.test(source.quote)
      ||source.documentId!==sources[0]?.documentId||source.title!==sources[0]?.title)throw Error('INVALID_RESPONSE');
  }
  // Detail plus all precaution parts form one indivisible product reference.
  if(sources.length===1||sources.length>0&&!sources[0]!.quote.includes('분류: 일반의약품'))throw Error('INVALID_RESPONSE');
  return sources;
}
export async function withHeadacheMedicines(reply: RagReply, question: string, lookup: (signal:AbortSignal)=>Promise<unknown>, signal?:AbortSignal): Promise<RagReply> {
  if(!headacheMedicineQuestion(question)||reply.status!=='local_evidence'||signal?.aborted
    ||!reply.sources.some(source=>source.documentId==='kdca-5830'))return reply;
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('LOOKUP_TIMEOUT'));},6000);});
    const sources=validateHeadacheMedicines(await Promise.race([lookup(controller.signal),timeout]));
    if(controller.signal.aborted||signal?.aborted||!sources.length||sources.length+reply.sources.length>5)return reply;
    return {...reply,sources:[...reply.sources,...sources],text:reply.text+'\n\n관련 일반의약품 공식 정보 · 개인별 복용 권고가 아닙니다.\n'+sources.map(source=>source.quote+'\n출처: '+source.sourceUrl).join('\n\n')};
  }catch{return reply;} // Optional medicine lookup never replaces the health evidence or claims safety.
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
