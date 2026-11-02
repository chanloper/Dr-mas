import { assertTextIntegrity, decodeUtf8 } from '../encoding.js';
import { hash, type DocumentInput } from '../model.js';

export const easySource = 'mfds-easy';
export const sources = {
  'mfds-easy': { publisher:'식품의약품안전처', url:'https://www.data.go.kr/data/15075057/openapi.do', specification:'verified' },
  'mfds-approval': { publisher:'식품의약품안전처', url:'https://www.data.go.kr/data/15095677/openapi.do', specification:'blocked' }
} as const;
export interface Medicine {
  id:string; source:string; itemId:string; name:string; manufacturer:string|null;
  ingredient:string|null; efficacy:string|null; usage:string|null; warning:string|null;
  precaution:string|null; adverseEffects:string|null; interaction:string|null; storage:string|null;
  publishedAt:string|null; updatedAt:string|null; collectedAt:string; sourceUrl:string; publisher:string;
}
export interface Page { items:Record<string,unknown>[]; totalCount:number; pageNo:number; numOfRows:number }
/** Transport is injected. This module has no fetch/default network implementation. */
export interface SourceAdapter {
  id:string; revision:string;
  load(pageNo:number,numOfRows:number):Promise<Uint8Array>;
  parse(bytes:Uint8Array):Page;
  transform(item:Record<string,unknown>,collectedAt:string):Medicine;
}
const fields = ['entpName','itemName','itemSeq','efcyQesitm','useMethodQesitm','atpnWarnQesitm','atpnQesitm','intrcQesitm','seQesitm','depositMethodQesitm','openDe','updateDe'] as const;
export type EasyFilters = Partial<Record<typeof fields[number],string>>;
function paging(page:number,rows:number) {
  if(!Number.isInteger(page)||page<1||page>99999||!Number.isInteger(rows)||rows<1||rows>100)throw new Error('INVALID_PAGING');
}
/** Only builds a request; never logs, stores, or sends the key. Use the portal's decoded key. */
export function easyRequest(pageNo:number,numOfRows:number,filters:EasyFilters={},env:NodeJS.ProcessEnv=process.env) {
  paging(pageNo,numOfRows);
  const key=env.DATA_GO_KR_SERVICE_KEY;
  if(!key?.trim())throw new Error('DATA_GO_KR_SERVICE_KEY_REQUIRED');
  const url=new URL('https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList');
  url.searchParams.set('ServiceKey',key);
  url.searchParams.set('pageNo',String(pageNo));url.searchParams.set('numOfRows',String(numOfRows));url.searchParams.set('type','json');
  for(const [name,value] of Object.entries(filters)) {
    if(!(fields as readonly string[]).includes(name)||typeof value!=='string'||value.length>4000)throw new Error('INVALID_FILTER');
    assertTextIntegrity(value);url.searchParams.set(name,value);
  }
  return {method:'GET' as const,url};
}
export function approvalAdapter():never { throw new Error('OFFICIAL_APPROVAL_SPEC_REQUIRED'); }
export function cleanText(value:unknown):string|null {
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string')throw new Error('INVALID_FIELD');
  assertTextIntegrity(value);
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  const text=value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,e:string)=>{
      if(e[0]!=='#')return entities[e.toLowerCase()]!;
      const n=e[1]?.toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));
      if(n<0||n>0x10ffff)throw new Error('INVALID_ENTITY');return String.fromCodePoint(n);
    }).normalize('NFC').replace(/\s+/gu,' ').trim();
  assertTextIntegrity(text);return text||null;
}
function date(value:unknown):string|null {
  const text=cleanText(value);if(!text)return null;
  const match=/^(\d{4})-?(\d{2})-?(\d{2})(?:[ T].*)?$/.exec(text);
  if(!match)throw new Error('INVALID_SOURCE_DATE');
  const iso=`${match[1]}-${match[2]}-${match[3]}`;
  if(new Date(iso).toISOString().slice(0,10)!==iso)throw new Error('INVALID_SOURCE_DATE');return iso;
}
export function parseEasy(bytes:Uint8Array):Page {
  if(bytes.byteLength>10_000_000)throw new Error('PAGE_TOO_LARGE');
  let data;try {data=JSON.parse(decodeUtf8(bytes));}catch{throw new Error('INVALID_API_JSON_OR_UTF8');}
  const response=data?.response??data;
  if(response?.header?.resultCode!=='00')throw new Error('MFDS_API_ERROR'); // Never echo upstream text/URL/key.
  const b=response.body;
  if(!b)throw new Error('INVALID_API_BODY');
  const pageNo=Number(b.pageNo),numOfRows=Number(b.numOfRows),totalCount=Number(b.totalCount);
  paging(pageNo,numOfRows);
  if(!Number.isSafeInteger(totalCount)||totalCount<0)throw new Error('INVALID_TOTAL_COUNT');
  const items=b.items===null||b.items===''||b.items===undefined?[]:b.items;
  if(!Array.isArray(items)||items.length>numOfRows||items.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('INVALID_API_ITEMS');
  return {items,totalCount,pageNo,numOfRows};
}
export function transformEasy(item:Record<string,unknown>,collectedAt:string):Medicine {
  const itemId=cleanText(item.itemSeq),name=cleanText(item.itemName);
  if(!itemId||!/^\d{1,30}$/.test(itemId)||!name)throw new Error('MISSING_ITEM_ID_OR_NAME');
  return {id:`${easySource}-${itemId}`,source:easySource,itemId,name,manufacturer:cleanText(item.entpName),ingredient:null,
    efficacy:cleanText(item.efcyQesitm),usage:cleanText(item.useMethodQesitm),warning:cleanText(item.atpnWarnQesitm),
    precaution:cleanText(item.atpnQesitm),adverseEffects:cleanText(item.seQesitm),interaction:cleanText(item.intrcQesitm),storage:cleanText(item.depositMethodQesitm),
    publishedAt:date(item.openDe),updatedAt:date(item.updateDe),collectedAt,
    sourceUrl:`${sources[easySource].url}#itemSeq=${itemId}`,publisher:sources[easySource].publisher};
}
export const medicineHash=(m:Medicine)=>hash(JSON.stringify({...m,collectedAt:undefined}));
export function medicineDocument(m:Medicine):DocumentInput {
  const labels:Partial<Record<keyof Medicine,string>>={name:'의약품명',itemId:'품목기준코드',manufacturer:'업체명',ingredient:'성분명',efficacy:'효능',usage:'사용법',warning:'경고',precaution:'주의사항',adverseEffects:'부작용',interaction:'상호작용',storage:'보관방법'};
  const content=Object.entries(labels).map(([key,label])=>m[key as keyof Medicine]?`${label}: ${m[key as keyof Medicine]}`:null).filter(Boolean).join('\n');
  return {id:m.id,title:m.name,publisher:m.publisher,sourceUrl:m.sourceUrl,publishedAt:m.publishedAt,updatedAt:m.updatedAt,collectedAt:m.collectedAt,category:'medicine',content,
    rights:{permission:'pending',terms:'공식 재사용 조건 기록 확인; Gemini 외부 전송 권한 미확인. 외부 전송 금지.',checkedAt:m.collectedAt}};
}
export function easyAdapter(load:SourceAdapter['load']):SourceAdapter {
  return {id:easySource,revision:'easy-json-v1',load,parse:parseEasy,transform:transformEasy};
}
