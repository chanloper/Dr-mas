import { assertTextIntegrity } from '../encoding.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, splitDocument } from '../model.js';
import type { Repository } from '../repository.js';
import { cleanText, medicineDocument, medicineHash, parseEasy, transformEasy, type Medicine } from './mfds.js';
import { MfdsError } from './http.js';

const mapping={itemId:'itemSeq',name:'itemName',manufacturer:'entpName',efficacy:'efcyQesitm',usage:'useMethodQesitm',warning:'atpnWarnQesitm',precaution:'atpnQesitm',adverseEffects:'seQesitm',interaction:'intrcQesitm',storage:'depositMethodQesitm'} as const;
function rawStatus(item:Record<string,unknown>,field:string) {
  if(!Object.hasOwn(item,field))return 'missing' as const;
  const value=item[field];
  if(value===null)return 'null' as const;
  if(value==='')return 'empty-string' as const;
  if(typeof value==='string'&&!value.trim())return 'whitespace-only' as const;
  return cleanText(value)===null?'empty-after-cleaning' as const:'provided' as const;
}
/** Offline audit. Every clinical field must equal only the documented text cleanup of its raw field.
 * Raw JSON remains unmodified; markup/whitespace/entity cleanup is the only expected difference.
 */
export async function inspectPilotSnapshot(store:Repository,rag:Repository) {
  return inspectCollectionSnapshot(store,rag,{pageSize:5,maxRows:5,maxPages:1});
}
export interface VerificationScope {pageSize:number;maxRows:number;maxPages:number}
export async function inspectCollectionSnapshot(store:Repository,rag:Repository,scope:VerificationScope) {
  if(!Number.isInteger(scope.pageSize)||scope.pageSize<1||scope.pageSize>10||!Number.isInteger(scope.maxRows)||scope.maxRows<1||scope.maxRows>50||!Number.isInteger(scope.maxPages)||scope.maxPages<1||scope.maxPages>5)throw new MfdsError('MFDS_INVALID_SCOPE');
  const state=await store.read(),ragState=await rag.read(),ingestion=state.ingestion;
  if(!ingestion||!Object.keys(ingestion.raw).length||Object.keys(ingestion.raw).length>scope.maxPages||Object.keys(ingestion.pending).length)throw new MfdsError('MFDS_VERIFICATION_FAILED');
  const snapshots=Object.entries(ingestion.raw).sort((a,b)=>a[1].pageNo-b[1].pageNo).map(([key,raw],index)=>{
    if(key!==hash(`${raw.source}:${raw.pageNo}:${raw.payload}`))throw new MfdsError('MFDS_VERIFICATION_FAILED');
    const page=parseEasy(new TextEncoder().encode(raw.payload));
    if(raw.source!=='mfds-easy'||raw.pageNo!==index+1||page.pageNo!==raw.pageNo||page.numOfRows!==scope.pageSize||page.items.length!==Math.max(0,Math.min(scope.pageSize,page.totalCount-(page.pageNo-1)*scope.pageSize)))throw new MfdsError('MFDS_VERIFICATION_FAILED');
    return {raw,page,sha256:hash(raw.payload)};
  });
  const sourceTotal=snapshots[0]!.page.totalCount;
  if(snapshots.some(s=>s.page.totalCount!==sourceTotal))throw new MfdsError('MFDS_SOURCE_TOTAL_CHANGED');
  const rows=snapshots.flatMap(s=>s.page.items.map((item,pageIndex)=>({item,sourcePage:s.page.pageNo,pageRow:pageIndex+1,collectedAt:s.raw.collectedAt})));
  if(rows.length>scope.maxRows)throw new MfdsError('MFDS_VERIFICATION_FAILED');
  const reports=[];const comparisons=[];const ids=new Set<string>();
  const groups=new Map<string,Array<{rawRow:number;item:Record<string,unknown>;collectedAt:string}>>();
  for(const [index,row] of rows.entries()) {
    const {item,sourcePage,pageRow,collectedAt}=row;
    const rawRow=index+1;
    const itemId=cleanText(item.itemSeq);
    if(!itemId)throw new MfdsError('MFDS_VERIFICATION_FAILED');
    const id=`mfds-easy-${itemId}`;ids.add(id);
    const group=groups.get(itemId)??[];group.push({rawRow,item,collectedAt});groups.set(itemId,group);
    const stored=ingestion.medicines[id]?.value;
    if(!stored||stored.ingredient!==null)throw new MfdsError('MFDS_VERIFICATION_FAILED');
    if(ingestion.medicines[id]!.hash!==medicineHash(stored))throw new MfdsError('MFDS_VERIFICATION_FAILED');
    const expectedMedicine=transformEasy(item,collectedAt);
    for(const field of Object.keys(expectedMedicine) as Array<keyof Medicine>)if(field!=='collectedAt'&&stored[field]!==expectedMedicine[field])throw new MfdsError('MFDS_VERIFICATION_FAILED');
    let koreanSyllables=0,htmlFields=0,emptyFields=0;
    const fields=[];
    for(const [target,source] of Object.entries(mapping)) {
      const original=item[source];const expected=cleanText(original);
      if(stored[target as keyof Medicine]!==expected)throw new MfdsError('MFDS_VERIFICATION_FAILED');
      fields.push({sourceField:source,targetField:target,rawStatus:rawStatus(item,source),raw:original??null,normalized:expected,matches:true});
      if(typeof original==='string') {
        assertTextIntegrity(original);koreanSyllables+=(original.match(/[가-힣]/gu)??[]).length;
        if(/<[^>]*>/.test(original))htmlFields++;
      }
      if(expected===null)emptyFields++;
    }
    const expected=medicineDocument(stored),doc=ragState.documents[id];
    if(!doc||doc.id!==id||doc.rights.permission!=='pending'||doc.content!==expected.content||doc.title!==stored.name||doc.sourceUrl!==stored.sourceUrl||doc.contentHash!==hash(expected.content))throw new MfdsError('MFDS_VERIFICATION_FAILED');
    for(const key of ['publisher','publishedAt','updatedAt','collectedAt','category'] as const)if(doc[key]!==expected[key])throw new MfdsError('MFDS_VERIFICATION_FAILED');
    const emptyFieldDetails=fields.filter(f=>f.normalized===null).map(f=>({sourceField:f.sourceField,targetField:f.targetField,rawStatus:f.rawStatus,raw:f.raw,normalized:null}));
    const changedTextFields=fields.filter(f=>typeof f.raw==='string'&&f.raw!==f.normalized).map(f=>f.sourceField);
    reports.push({rawRow,sourcePage,pageRow,itemId,fieldsMatched:Object.keys(mapping).length,populatedFieldsMatched:Object.keys(mapping).length-emptyFields,koreanSyllables,htmlFields,emptyFields,emptyFieldDetails,changedTextFields});
    comparisons.push({rawRow,sourcePage,pageRow,itemId,name:stored.name,publisher:stored.publisher,sourceUrl:stored.sourceUrl,collectedAt,updatedAt:stored.updatedAt,fields});
  }
  for(const [itemId,group] of groups)if(!group.some(row=>row.collectedAt===ingestion.medicines[`mfds-easy-${itemId}`]!.value.collectedAt))throw new MfdsError('MFDS_VERIFICATION_FAILED');
  if(Object.keys(ingestion.medicines).length!==ids.size||Object.keys(ragState.documents).length!==ids.size||Object.keys(ragState.vectors).length||ragState.usage.calls!==0)throw new MfdsError('MFDS_VERIFICATION_FAILED');
  const expectedChunks=Object.values(ragState.documents).flatMap(doc=>splitDocument(doc));
  if(expectedChunks.length!==Object.keys(ragState.chunks).length)throw new MfdsError('MFDS_VERIFICATION_FAILED');
  for(const chunk of expectedChunks) {
    const stored=ragState.chunks[chunk.id];
    if(!stored||Object.keys(chunk).some(key=>stored[key as keyof typeof stored]!==chunk[key as keyof typeof chunk]))throw new MfdsError('MFDS_VERIFICATION_FAILED');
  }
  const normalizedSourceFields=new Set<string>([...Object.values(mapping),'openDe','updateDe']);
  const duplicates=[...groups].filter(([,group])=>group.length>1).map(([itemId,group])=>{
    const first=group[0]!.item;
    const keys=[...new Set(group.flatMap(row=>Object.keys(row.item)))];
    const differingFields=keys.filter(key=>group.some(row=>Object.hasOwn(row.item,key)!==Object.hasOwn(first,key)||JSON.stringify(row.item[key])!==JSON.stringify(first[key])));
    const normalizedHashes=group.map(row=>medicineHash(transformEasy(row.item,row.collectedAt)));
    return {itemId,rawRows:group.map(row=>row.rawRow),occurrences:group.length,differingFields,
      normalizedFieldsIdentical:normalizedHashes.every(digest=>digest===normalizedHashes[0]),
      classification:differingFields.length===0?'identical':differingFields.every(field=>!normalizedSourceFields.has(field))?'metadata-variant':'normalization-variant'};
  });
  const rawPages=snapshots.map(s=>({pageNo:s.page.pageNo,rawRows:s.page.items.length,sha256:s.sha256}));
  const summary={status:'verified' as const,rawSha256:snapshots.length===1?snapshots[0]!.sha256:hash(JSON.stringify(rawPages)),rawPages,items:ids.size,rawRows:rows.length,uniqueItems:ids.size,duplicateRows:rows.length-ids.size,recordUnit:'raw-row' as const,duplicates,sourceTotal,permission:'pending' as const,externalCalls:0,deletionStatus:'unverified' as const,externalAiPermission:'unverified' as const,records:reports};
  return {summary,report:{schema:2,generatedAt:new Date().toISOString(),...summary,unavailableFields:[{field:'ingredient',reason:'not-provided-by-easy-api'}],comparisons}};
}
export async function verifyPilotSnapshot(store:Repository,rag:Repository) {
  return (await inspectPilotSnapshot(store,rag)).summary;
}
type ComparisonReport=Awaited<ReturnType<typeof inspectPilotSnapshot>>['report'];
const escapeHtml=(value:unknown)=>String(value??'(미제공)').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Raw markup is always escaped, never interpreted as report HTML. No external assets/scripts. */
export function renderPilotReport(report:ComparisonReport):string {
  const sections=report.comparisons.map(record=>`<section><h2>원본 행 ${record.rawRow}: ${escapeHtml(record.itemId)} — ${escapeHtml(record.name)}</h2>
<p>기관: ${escapeHtml(record.publisher)} · 수집일: ${escapeHtml(record.collectedAt)} · 갱신일: ${escapeHtml(record.updatedAt)}</p>
<p>출처: ${escapeHtml(record.sourceUrl)}</p>
<table><thead><tr><th>필드</th><th>원문</th><th>정제 데이터</th><th>대조</th></tr></thead><tbody>${record.fields.map(field=>
`<tr><th>${escapeHtml(field.sourceField)}<br>${escapeHtml(field.targetField)}</th><td>${escapeHtml(field.raw)}<br><small>원본 상태: ${escapeHtml(field.rawStatus)}</small></td><td>${escapeHtml(field.normalized)}</td><td>일치</td></tr>`).join('')}</tbody></table></section>`).join('\n');
  const duplicates=report.duplicates.map(d=>`<li>품목 ${escapeHtml(d.itemId)}: 원본 행 ${d.rawRows.join(', ')} / 다른 원본 필드: ${escapeHtml(d.differingFields.join(', ')||'없음')} / 분류: ${escapeHtml(d.classification)} / 정제 데이터 동일: ${d.normalizedFieldsIdentical}</li>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Dr.MAS e약은요 원문 대조 보고서</title><style>body{font-family:system-ui,sans-serif;margin:2rem;color:#172b3a;line-height:1.6}section{margin-top:2rem}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #bccbd4;padding:.7rem;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eef4f7}th:first-child{width:14%}th:last-child{width:6%}@media(max-width:650px){body{margin:.5rem}th,td{padding:.3rem}}@media print{section{break-before:page}tr{break-inside:avoid}}</style></head>
<body><h1>Dr.MAS e약은요 원문 대조 보고서</h1><p>생성: ${escapeHtml(report.generatedAt)} · 원본 행: ${report.rawRows}개 · 고유 품목: ${report.uniqueItems}개 · 중복 행: ${report.duplicateRows}개 · 검증: ${report.status}</p>
<p>records와 아래 대조표는 원본 행 단위입니다. fieldsMatched는 null을 포함한 10개 필드의 대조 성공 수이며, 정보가 모두 제공되었다는 의미가 아닙니다. 성분명은 이 API의 독립 제공 필드가 없어 null로 유지합니다.</p>
<ul>${duplicates}</ul>
<p>권한: pending · Gemini 호출: 0회. 원문과 정제문의 차이는 HTML·엔티티·공백·NFC 정리 범위입니다. 미제공 항목은 추정하지 않습니다.</p>
<p>원본 SHA-256: ${escapeHtml(report.rawSha256)}</p>${sections}</body></html>`;
}
/** Local files contain comparison data. Console callers receive only the safe summary. */
export async function writePilotVerification(store:Repository,rag:Repository,directory:string,scope?:VerificationScope) {
  const {summary,report}=scope?await inspectCollectionSnapshot(store,rag,scope):await inspectPilotSnapshot(store,rag);
  await writeFile(join(directory,'verification-report.json'),JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
  await writeFile(join(directory,'verification-report.html'),renderPilotReport(report),{encoding:'utf8',mode:0o600});
  return {...summary,reportFiles:['verification-report.json','verification-report.html']};
}
