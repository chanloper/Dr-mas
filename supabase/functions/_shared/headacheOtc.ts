// Official schemas: data.go.kr 15095677 (08 detail) and 15075057 (e약은요).
// Product references only; no diagnosis, suitability ranking, patient data or AI.
type Row = Record<string, unknown>;
export const APPROVAL_SOURCE = 'https://www.data.go.kr/data/15095677/openapi.do';
const EASY_SOURCE = 'https://www.data.go.kr/data/15075057/openapi.do';
const CONVENIENCE_SOURCE = 'https://www.mohw.go.kr/menu.es?mid=a10702040200';
export type MedicineSource = { documentId: string; chunkId: string; title: string; publisher: string; sourceUrl: string; quote: string };
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 150000 || /<!DOCTYPE|<!ENTITY/i.test(value)) return '';
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    // MFDS document XML can put the contraindication heading in ARTICLE title.
    // Preserve that heading: dropping it could reverse the meaning of its list.
    .replace(/<[A-Za-z][^>]*\btitle\s*=\s*(["'])([^"']*)\1[^>]*>/gi,' $2 ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,name:string)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[name]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code:string)=>{
      const point=code[0]?.toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
      return point>=32&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'';
    }).replace(/\s+/gu,' ').trim();
}
function rows(input: unknown, max: number): Row[] {
  const outer=input as {response?:unknown};
  const value=(outer?.response??input) as {header?:{resultCode?:unknown};body?:{items?:unknown;totalCount?:unknown}};
  if(String(value?.header?.resultCode)!=='00')throw Error('PROVIDER_REJECTED');
  const total=value.body?.totalCount;
  if(!['string','number'].includes(typeof total)||total===''||!Number.isSafeInteger(Number(total))||Number(total)<0)throw Error('PROVIDER_RESPONSE_INVALID');
  let items=value.body?.items;
  if(items&&typeof items==='object'&&!Array.isArray(items)&&'item' in items)items=(items as {item:unknown}).item;
  const found=items==null||items===''?[]:Array.isArray(items)?items:[items];
  if(found.length>max||found.length>Number(total)||found.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('PROVIDER_RESPONSE_INVALID');
  return found as Row[];
}
function endpoint(path: string, key: string, params: Record<string,string>) {
  const url=new URL('https://apis.data.go.kr/1471000/'+path);
  url.searchParams.set(path.startsWith('DrbEasy')?'ServiceKey':'serviceKey',key);
  for(const [name,value]of Object.entries({pageNo:'1',numOfRows:'3',type:'json',...params}))url.searchParams.set(name,value);
  return url;
}
function sources(easy: Row, approval: Row): MedicineSource[] {
  const id=String(easy.itemSeq),name=text(approval.ITEM_NAME),efficacy=text(approval.EE_DOC_DATA);
  const ingredient=text(approval.MAIN_ITEM_INGR),usage=text(approval.UD_DOC_DATA),precaution=text(approval.NB_DOC_DATA);
  if(String(approval.ITEM_SEQ)!==id||!/^\d{9}$/.test(id)||!name||name.length>250||name!==text(easy.itemName)
    ||text(approval.ENTP_NAME)!==text(easy.entpName)||!text(approval.ENTP_NAME)
    ||text(approval.ETC_OTC_CODE)!=='일반의약품'||text(approval.CANCEL_NAME)!=='정상'||text(approval.CANCEL_DATE)
    ||!efficacy.includes('두통')||!text(easy.efcyQesitm).includes('두통')||!ingredient||!usage||!precaution
    ||/[\u0000-\u001f<>]/u.test(name+ingredient+efficacy+usage+precaution))return [];
  // Official list identifies this exact item; designation applies only to 8-tablet packs.
  // Unknown membership is never converted to "not designated" or to store availability.
  const convenience=id==='199303108'&&name==='타이레놀정500밀리그람(아세트아미노펜)(수출명:TylenolExtraStrengthCaplets)'
    &&/(?:^|[^0-9])8\s*정(?:[^0-9]|$)/u.test(text(approval.PACK_UNIT))
    ?`안전상비의약품: 공식 지정 8정 포장에 한함. 등록된 판매점에서 취급할 수 있으며 판매·재고는 미확인입니다. 근거: ${CONVENIENCE_SOURCE}`
    :'안전상비의약품: 품목·포장 일치 근거 미확인. 편의점 구매 가능 여부를 분류하지 않았습니다.';
  const info=`제품명: ${name}\n분류: 일반의약품\n성분: ${ingredient}\n허가 효능: ${efficacy}\n허가 복용법: ${usage}\n${convenience}\n허가정보 출처: ${APPROVAL_SOURCE}\ne약은요 출처: ${EASY_SOURCE}\n개인별 복용 권고가 아닌 공식 효능 일치 품목의 예시입니다. 약국 찾기로 위치를 확인할 수 있으나 재고는 확인되지 않습니다.`;
  if(info.length>4000)return [];
  const parts:string[]=[];
  for(let start=0;start<precaution.length;start+=3500)parts.push(precaution.slice(start,start+3500));
  if(parts.length>3)return [];
  const make=(quote:string,index:number):MedicineSource=>({documentId:'mfds-otc-'+id,chunkId:`mfds-otc-${id}:${index}`,
    title:name,publisher:'식품의약품안전처',sourceUrl:'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq='+id,quote});
  return [make(info,0),...parts.map((part,index)=>make(`허가 사용상 주의사항 (${index+1}/${parts.length})\n${part}\n현재 복약 정보와의 병용금기 검사는 하지 않았습니다. 복약 품목을 확인한 뒤 기존 DUR 조회를 사용하고 약사와 상의하세요.`,index+1))];
}
export async function headacheOtc(key: string, load: (url: URL)=>Promise<unknown>) {
  const easy=rows(await load(endpoint('DrbEasyDrugInfoService/getDrbEasyDrugList',key,{efcyQesitm:'두통'})),3);
  for(const item of easy) {
    const id=String(item.itemSeq);
    if(!/^\d{9}$/.test(id)||!text(item.efcyQesitm).includes('두통'))continue;
    const found=rows(await load(endpoint('DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08',key,{item_seq:id})),3);
    // One exact product response only; no fuzzy joins or silently choosing among duplicates.
    if(found.length!==1)continue;
    const references=sources(item,found[0]!);
    if(references.length)return {status:'reference_only',symptom:'두통',sources:references,checkedAt:new Date().toISOString()};
  }
  return {status:'reference_only',symptom:'두통',sources:[],checkedAt:new Date().toISOString()};
}
