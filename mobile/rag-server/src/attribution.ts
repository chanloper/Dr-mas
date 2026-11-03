import type {MedicalDocument,SourceAttribution} from './model.js';
const datasetUrl='https://www.data.go.kr/data/15075057/openapi.do';
export const mfdsDataset={datasetName:'의약품개요정보(e약은요)',datasetUrl,termsLabel:'이용허락범위 제한 없음',termsUrl:'https://www.data.go.kr/catalog/15075057/openapi.json'} as const;
// Display metadata only, never a rights grant. Existing saved records are not rewritten.
export function sourceAttribution(doc:MedicalDocument):SourceAttribution|undefined {
 if(doc.attribution)return structuredClone(doc.attribution);
 const match=/^mfds-easy-(\d{1,30})$/.exec(doc.id);
 if(match&&doc.publisher==='식품의약품안전처'&&(doc.sourceUrl===datasetUrl||doc.sourceUrl===`${datasetUrl}#itemSeq=${match[1]}`))return {...mfdsDataset,itemCode:match[1]!};
 return undefined;
}
