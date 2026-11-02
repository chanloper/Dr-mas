import { assertTextIntegrity } from './encoding.js';
import { createHash } from 'node:crypto';
export const categories = ['disease','medicine','medication','lifestyle','caregiver'] as const;
export interface DocumentInput {
  id: string; title: string; publisher: string; sourceUrl: string;
  publishedAt: string | null; updatedAt: string | null; collectedAt: string;
  category: typeof categories[number]; content: string;
  rights: { terms: string; permission: 'permitted' | 'test-only'; checkedAt: string };
}
export interface MedicalDocument extends DocumentInput { contentHash: string; version: number }
export interface Chunk { id: string; documentId: string; version: number; contentHash: string; text: string; start: number; end: number }
export interface Vector { profile: string; values: number[] }
export interface State { schema: 1; embeddingCache?: Record<string,number[]>; documents: Record<string,MedicalDocument>; chunks: Record<string,Chunk>; vectors: Record<string,Vector>; usage: { calls: number; characters: number }; }
export const emptyState = (): State => ({schema:1,documents:{},chunks:{},vectors:{},usage:{calls:0,characters:0}});
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function normalize(s: string): string { assertTextIntegrity(s); return s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('ko'); }
export function validateDocument(value: unknown): DocumentInput {
  if (!value || typeof value !== 'object') throw new Error('INVALID_DOCUMENT');
  const d = value as DocumentInput;
  for (const key of ['id','title','publisher','sourceUrl','content','collectedAt'] as const)
    if (typeof d[key] !== 'string' || !d[key].trim()) throw new Error(`INVALID_${key}`);
  if (Object.hasOwn(Object.prototype,d.id) || !/^[a-zA-Z0-9_-]{1,100}$/.test(d.id) || d.content.length > 2_000_000) throw new Error('INVALID_DOCUMENT_LIMIT');
  const url = new URL(d.sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('INVALID_SOURCE_URL');
  if (!categories.includes(d.category)) throw new Error('INVALID_CATEGORY');
  for (const key of ['publishedAt','updatedAt','collectedAt'] as const)
    if (d[key] !== null && (typeof d[key] !== 'string' || !Number.isFinite(Date.parse(d[key])))) throw new Error(`INVALID_${key}`);
  if (!d.rights || !['permitted','test-only'].includes(d.rights.permission) || !d.rights.terms?.trim() || !Number.isFinite(Date.parse(d.rights.checkedAt))) throw new Error('RIGHTS_REQUIRED');
  for(const value of [d.title,d.publisher,d.content,d.rights.terms])assertTextIntegrity(value);
  return structuredClone(d);
}
// Offsets refer to the original text; overlap preserves context at boundaries.
export function splitDocument(d: MedicalDocument, size=800, overlap=120): Chunk[] {
  if (!Number.isInteger(size) || size < 64 || overlap < 0 || overlap >= size) throw new Error('INVALID_CHUNK_CONFIG');
  const result: Chunk[] = [];
  for (let start=0; start < d.content.length;) {
    let end = Math.min(start+size,d.content.length);
    if (end < d.content.length) {
      const boundary = d.content.lastIndexOf('\n',end);
      if (boundary > start+size/2) end=boundary+1;
    }
    if(end<d.content.length&&/[\uD800-\uDBFF]/.test(d.content[end-1]!))end--;
    const text=d.content.slice(start,end);
    result.push({id:`${d.id}:${d.version}:${start}`,documentId:d.id,version:d.version,contentHash:hash(text),text,start,end});
    if (end === d.content.length) break;
    start=Math.max(start+1,end-overlap);
    if(/[\uDC00-\uDFFF]/.test(d.content[start]??''))start++;
  }
  return result;
}
