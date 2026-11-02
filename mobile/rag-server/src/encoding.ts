import { readFile } from 'node:fs/promises';
export function decodeUtf8(bytes:Uint8Array):string {
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('INVALID_UTF8_INPUT');}
}
export async function readJsonUtf8(path:string):Promise<unknown>{return JSON.parse(decodeUtf8(await readFile(path)));}
export function assertTextIntegrity(text:string):void {
 if(typeof text!=='string'||text.includes('\uFFFD')||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))throw new Error('TEXT_ENCODING_REVIEW_REQUIRED');
 // UTF-16 surrogate pairs must be complete before JSON/UTF-8 serialization.
 for(let i=0;i<text.length;i++){
   const c=text.charCodeAt(i);
   if(c>=0xD800&&c<=0xDBFF){const next=text.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))throw new Error('TEXT_ENCODING_REVIEW_REQUIRED');}
   else if(c>=0xDC00&&c<=0xDFFF)throw new Error('TEXT_ENCODING_REVIEW_REQUIRED');
 }
 // Known mojibake signatures. Reject for manual review; never auto-repair medical text.
 if(/(?:Ã.|Â.|â€|ì[ˆ‹„]|ë[©¬¶]|(?:\?[가-힣][^?\n]{0,12}){3})/u.test(text))throw new Error('TEXT_ENCODING_REVIEW_REQUIRED');
}
