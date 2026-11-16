import { parseHiraXml } from './hira-reference.js';
import { validateDocument, type DocumentInput } from './model.js';
import { kdcaCatalog, kdcaLimits, kdcaOfflineReviewMaxBytes, kdcaOfficialEndpoint, kdcaTermsUrl, normalizeKdcaToken, type KdcaTokenEncoding, type KdcaContent } from './kdca-catalog.js';
import { safeKdcaProviderCode, type kdcaProviderErrors } from './kdca-errors.js';

export class KdcaError extends Error {
  constructor(public code: 'LIVE_DISABLED' | 'NOT_APPROVED' | 'NOT_CONFIGURED' | 'INVALID_XML' | 'INVALID_RESPONSE' | 'PROVIDER' | 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'CANCELLED' | 'TOO_LARGE' | 'SECRET_IN_RESPONSE', public readonly httpStatus?: number, public readonly providerCode?: keyof typeof kdcaProviderErrors) { super('KDCA_' + code); }
}
type Node = ReturnType<typeof parseHiraXml>;
export type KdcaPayload = { contentId: string; title: string; lclassn?: string; sections: { id?: string; name: string; body: string }[]; rawXml: string };
const flatten = (node: Node): Node[] => [node, ...node.children.flatMap(flatten)];
function scalar(node: Node): string {
  if(node.children.length) throw new KdcaError('INVALID_RESPONSE');
  return node.text;
}
function kdcaEnvelope(xml: string): Node {
  let root: Node;
  try { root = parseHiraXml('<kdcaEnvelope>' + xml.replace(/^\uFEFF?\s*<\?xml[^?]*\?>/u, '') + '</kdcaEnvelope>'); }
  catch { throw new KdcaError('INVALID_XML'); }
  // Preserve the received bytes; support only the observed sole XML wrapper.
  if (root.children.length === 1 && root.children[0]!.name === 'XML') {
    if (root.text.trim()) throw new KdcaError('INVALID_RESPONSE');
    root = root.children[0]!;
  }
  return root;
}
export function parseKdcaXml(xml: string, expected: KdcaContent, options: { offlineReview?: boolean } = {}): KdcaPayload {
  const limit = options.offlineReview === true ? kdcaOfflineReviewMaxBytes : kdcaLimits.maxResponseBytes;
  if(Buffer.byteLength(xml,'utf8')>limit) throw new KdcaError('TOO_LARGE');
  const root = kdcaEnvelope(xml);
  const nodes = flatten(root);
  // Accept the guide's HEAD/svc envelope only, not older invented response shapes.
  let metadata: Node[], statusNodes: Node[], sectionNodes: Node[];
  {
    const heads=root.children.filter(n=>n.name==='HEAD'),services=root.children.filter(n=>n.name==='svc');
    if(root.text.trim() || root.children.some(n=>!['HEAD','svc'].includes(n.name))) throw new KdcaError('INVALID_RESPONSE');
    if(heads.length!==1)throw new KdcaError('INVALID_RESPONSE');
    statusNodes=heads[0]!.children;
    // Error-only HEAD is valid provider failure, never a successful empty document.
    const codes=statusNodes.filter(n=>n.name==='CODE');
    if(codes.length!==1)throw new KdcaError('INVALID_RESPONSE');
    const code=scalar(codes[0]!).trim();
    if(code!=='S001')throw new KdcaError('PROVIDER',undefined,safeKdcaProviderCode(code));
    if(services.length!==1)throw new KdcaError('INVALID_RESPONSE');
    metadata=services[0]!.children;
    const lists=metadata.filter(n=>n.name==='cntntsClList');
    if(lists.length!==1||lists[0]!.children.some(n=>n.name!=='cntntsCl'))throw new KdcaError('INVALID_RESPONSE');
    sectionNodes=lists[0]!.children;
  }
  if(nodes.some(n=>/^(?:TOKEN|SERVICEKEY|APIKEY)$/i.test(n.name))) throw new KdcaError('SECRET_IN_RESPONSE');
  const one = (name: string, scope=metadata) => {
    const found = scope.filter(n=>n.name===name);
    if(found.length!==1) throw new KdcaError('INVALID_RESPONSE');
    return scalar(found[0]!).trim();
  };
  if(one('CODE',statusNodes)!=='S001') throw new KdcaError('PROVIDER');
  if(one('MESSAGE',statusNodes)!=='OK' || one('CNTNTS_SN')!==expected.contentId || one('CNTNTSSJ')!==expected.expectedTitle) throw new KdcaError('INVALID_RESPONSE');
  const lclassn=one('LCLASSN');
  const sections = sectionNodes.map(n=>{
    const names=n.children.filter(c=>c.name==='CNTNTS_CL_NM'), bodies=n.children.filter(c=>c.name==='CNTNTS_CL_CN');
    // The response table marks section title/body optional. Preserve absent or
    // empty values, rather than manufacture text; duplicated fields still fail.
    if(names.length>1 || bodies.length>1) throw new KdcaError('INVALID_RESPONSE');
    const name=names.length?scalar(names[0]!):'', body=bodies.length?scalar(bodies[0]!):'';
    // CDATA (including HTML) remains literal and unchanged. Never execute HTML,
    // strip markup, normalize spaces, summarize or generate medical statements.
    const ids=n.children.filter(c=>c.name==='CNTNTSCLSN');
    if(ids.length!==1)throw new KdcaError('INVALID_RESPONSE');
    const id=scalar(ids[0]!).trim();
    if(!id)throw new KdcaError('INVALID_RESPONSE');
    return {id,name,body};
  });
  if(!sections.length || sections.length>100 || nodes.filter(n=>n.name==='CNTNTS_CL_CN').length!==sectionNodes.filter(n=>n.children.some(c=>c.name==='CNTNTS_CL_CN')).length) throw new KdcaError('INVALID_RESPONSE');
  if(sections.length!==sectionNodes.length)throw new KdcaError('INVALID_RESPONSE');
  return {contentId:expected.contentId,title:expected.expectedTitle,lclassn,sections,rawXml:xml};
}
export function kdcaDocument(payload: KdcaPayload, entry: KdcaContent, collectedAt: string): DocumentInput {
  if(payload.contentId!==entry.contentId || payload.title!==entry.expectedTitle || !/^\d+$/.test(entry.contentId)) throw new KdcaError('INVALID_RESPONSE');
  return validateDocument({
    id:`kdca-${entry.contentId}`,title:payload.title,publisher:'질병관리청 국가건강정보포털',sourceUrl:entry.sourceUrl,
    collectedAt,publishedAt:null,updatedAt:null,category:'disease',
    content:payload.sections.map(s=>`${s.name}\n${s.body}`).join('\n\n'),
    attribution:{datasetName:`질병관리청 국가건강정보포털 · ${payload.title}`,datasetUrl:entry.sourceUrl,itemCode:entry.contentId,
      termsLabel:'콘텐츠 변경 금지·출처 표시·갱신 및 승인 목적 준수 — RAG 이용 범위 검토 대기',termsUrl:kdcaTermsUrl},
    rights:{permission:'pending',checkedAt:collectedAt,terms:'API 이용 승인과 RAG 가공·부분 인용 승인은 구분합니다. HTML 변환·청킹·인용 범위 및 갱신 방식 검토 전 검색 비활성. 외부 생성·임베딩 금지.',
      scopes:{local_search:{decision:'pending'},quotation:{decision:'pending'},external_generation:{decision:'denied'},external_embedding:{decision:'denied'}}},
  });
}
// Offline contract testing only: no implicit fetch, HTTPS substitution or HTTP fallback.
// A real transport must not be wired until collection and secure transmission are approved.
export async function fetchKdca(entry: KdcaContent, token: string, options: {signal?:AbortSignal;transport?:typeof fetch;timeoutMs?:number;tokenEncoding?:KdcaTokenEncoding} = {}): Promise<KdcaPayload> {
  if(!options.transport) throw new KdcaError('LIVE_DISABLED');
  try { token = normalizeKdcaToken(token, options.tokenEncoding); } catch { throw new KdcaError('NOT_CONFIGURED'); }
  const approved=kdcaCatalog.find(item=>item.contentId===entry.contentId);
  if(!approved || !/^\d{1,10}$/.test(entry.contentId) || approved.expectedTitle!==entry.expectedTitle || approved.sourceUrl!==entry.sourceUrl || approved.tokenEnvName!==entry.tokenEnvName) throw new KdcaError('NOT_APPROVED');
  if(!token || token.length>4096 || /[\u0000-\u0020\u007f]/u.test(token) || entry.request.mode!=='content-parameter' || entry.request.parameter!=='cntntsSn' || !['per-content','shared-confirmed'].includes(entry.tokenBinding)) throw new KdcaError('NOT_CONFIGURED');
  if(options.signal?.aborted) throw new KdcaError('CANCELLED');
  const url=new URL(kdcaOfficialEndpoint);
  url.searchParams.set('TOKEN',token);
  url.searchParams.set('cntntsSn',entry.contentId);
  const timeoutMs=options.timeoutMs??8000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000) throw new KdcaError('NOT_CONFIGURED');
  const controller=new AbortController();let timedOut=false;
  let rejectAbort:(error:KdcaError)=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{controller.abort();rejectAbort(new KdcaError('CANCELLED'));};
  options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();rejectAbort(new KdcaError('TIMEOUT'));},timeoutMs);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const run=async()=>{
      const r=await options.transport!(url,{redirect:'error',signal:controller.signal,headers:{Accept:'application/xml, text/xml','Cache-Control':'no-store'}});
      if(!r.ok) throw new KdcaError('HTTP',r.status);
      if(Number(r.headers.get('content-length'))>kdcaLimits.maxResponseBytes) throw new KdcaError('TOO_LARGE');
      reader=r.body?.getReader();if(!reader) throw new KdcaError('INVALID_RESPONSE');
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>kdcaLimits.maxResponseBytes)throw new KdcaError('TOO_LARGE');chunks.push(part.value);}
      let xml:string;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw new KdcaError('INVALID_XML');}
      if([token,encodeURIComponent(token)].some(t=>xml.includes(t)))throw new KdcaError('SECRET_IN_RESPONSE');
      return parseKdcaXml(xml,entry);
    };
    return await Promise.race([run(),cancelled]);
  } catch(error) {
    if(error instanceof KdcaError)throw error;
    throw new KdcaError(timedOut?'TIMEOUT':options.signal?.aborted?'CANCELLED':'NETWORK');
  } finally { clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.abort();void reader?.cancel().catch(()=>{}); }
}
