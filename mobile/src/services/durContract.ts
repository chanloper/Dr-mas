// Only confirmed medicine identifiers cross this boundary; never image/identity/dose.
export type DurDrug = { name: string; itemSeq?: string };
export const DUR_SOURCE_URL = 'https://www.data.go.kr/data/15059486/openapi.do';
export const MEDICINE_SEARCH_SOURCE_URL = 'https://www.data.go.kr/data/15095677/openapi.do';
export type DurCandidate = { name: string; itemSeq: string; manufacturer: string | null; ingredient: string | null };
export type DurSearchInput = { mode: 'search'; query: string; page: number };
export type DurSearchResult = { status: 'reference_only'; query: string; page: number; candidates: DurCandidate[]; hasMore: boolean; truncated: boolean; checkedAt: string; outcome?: 'matched'|'empty'|'filtered'|'incomplete' };
export type DurResult = {
  status: 'reference_only';
  drugs: { name: string; itemSeq: string | null; identityConfirmed: boolean; truncated: boolean; candidates: { name: string; itemSeq: string }[] }[];
  warnings: { first: string; second: string; content: string }[];
  notices?: { name: string; counterpart: string | null; content: string }[];
  checkedAt?: string;
  incomplete?: boolean;
  comparisonStatus?: 'matched'|'no_registered_match'|'unverified';
};
export function validateDurSearch(input: unknown): DurSearchInput {
  const v = input as DurSearchInput;
  if (!v || v.mode !== 'search' || Object.keys(v).some(k => !['mode', 'query', 'page'].includes(k)) || !Number.isInteger(v.page) || v.page < 1 || v.page > 3) throw Error('INVALID_INPUT');
  validateDurDrugs([{ name: v.query }]);
  return { mode: 'search', query: v.query, page: v.page };
}
export function validateDurSearchResult(input: unknown): DurSearchResult {
  const v = input as DurSearchResult;
  if (!v || v.status !== 'reference_only' || typeof v.query !== 'string' || typeof v.hasMore !== 'boolean' || typeof v.truncated !== 'boolean'
    || !Number.isInteger(v.page) || v.page < 1 || v.page > 3 || !Array.isArray(v.candidates) || v.candidates.length > 100
    || typeof v.checkedAt !== 'string' || !Number.isFinite(Date.parse(v.checkedAt))) throw Error('INVALID_RESPONSE');
  validateDurSearch({ mode: 'search', query: v.query, page: v.page });
  if(v.outcome!==undefined&&!['matched','empty','filtered','incomplete'].includes(v.outcome))throw Error('INVALID_RESPONSE');
  if(v.outcome==='matched'&&!v.candidates.length||v.outcome==='empty'&&(v.candidates.length||v.hasMore||v.truncated)
    ||v.outcome==='filtered'&&v.candidates.length||v.outcome==='incomplete'&&!v.truncated)throw Error('INVALID_RESPONSE');
  const seen = new Set<string>();
  for (const c of v.candidates) {
    validateDurDrugs([{ name: c?.name, itemSeq: c?.itemSeq }]);
    if (!c.itemSeq || !c.name.includes(v.query) || seen.has(c.itemSeq) || [c.manufacturer, c.ingredient].some(x => x !== null && (typeof x !== 'string' || x.length < 1 || x.length > 300 || /[\u0000-\u001f<>]/u.test(x)))) throw Error('INVALID_RESPONSE');
    seen.add(c.itemSeq);
  }
  return v;
}
export function validateDurDrugs(input: unknown): DurDrug[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 6) throw Error('INVALID_INPUT');
  const result = input.map(value => {
    if (!value || typeof value !== 'object' || Object.keys(value).some(k => !['name', 'itemSeq'].includes(k))) throw Error('INVALID_INPUT');
    const { name, itemSeq } = value;
    if (typeof name !== 'string' || name !== name.trim() || name.length < 2 || name.length > 100 || /[\u0000-\u001f<>@/\\]/u.test(name)
      || /\d{6}\s*-?\s*[1-8]\d{6}/u.test(name) || itemSeq !== undefined && (typeof itemSeq !== 'string' || !/^\d{9}$/.test(itemSeq))) throw Error('INVALID_INPUT');
    return { name, ...(itemSeq ? { itemSeq } : {}) };
  });
  if (new Set(result.map(x => x.itemSeq ?? x.name)).size !== result.length) throw Error('INVALID_INPUT');
  return result;
}
export function parseDurDraft(text: string): DurDrug[] {
  return validateDurDrugs(text.split('\n').filter(line => line.trim()).map(line => {
    const parts = line.split('|').map(x => x.trim());
    if (parts.length > 2) throw Error('INVALID_INPUT');
    return { name: parts[0], ...(parts[1] ? { itemSeq: parts[1] } : {}) };
  }));
}
export function validateDurResult(value: unknown): DurResult {
  const r = value as DurResult;
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f<>]/u.test(v);
  if (!r || r.status !== 'reference_only' || !Array.isArray(r.drugs) || r.drugs.length < 1 || r.drugs.length > 6
    || !Array.isArray(r.warnings) || r.warnings.length > 100) throw Error('INVALID_RESPONSE');
  for (const d of r.drugs) {
    if (!text(d.name, 100) || d.itemSeq !== null && !/^\d{9}$/.test(d.itemSeq) || typeof d.identityConfirmed !== 'boolean'
      || typeof d.truncated !== 'boolean' || !Array.isArray(d.candidates) || d.candidates.length > 20
      || d.candidates.some(c => !text(c.name, 100) || !/^\d{9}$/.test(c.itemSeq))) throw Error('INVALID_RESPONSE');
  }
  for (const w of r.warnings) if (!text(w.first, 100) || !text(w.second, 100) || !text(w.content, 1500)) throw Error('INVALID_RESPONSE');
  if (r.checkedAt !== undefined && (typeof r.checkedAt !== 'string' || !Number.isFinite(Date.parse(r.checkedAt)))) throw Error('INVALID_RESPONSE');
  if(r.incomplete!==undefined&&typeof r.incomplete!=='boolean'||r.comparisonStatus!==undefined&&!['matched','no_registered_match','unverified'].includes(r.comparisonStatus))throw Error('INVALID_RESPONSE');
  if(r.comparisonStatus==='matched'&&!r.warnings.length||r.comparisonStatus==='no_registered_match'&&(r.warnings.length||r.incomplete||r.drugs.some(d=>!d.identityConfirmed||d.truncated)))throw Error('INVALID_RESPONSE');
  if (r.notices !== undefined && (!Array.isArray(r.notices) || r.notices.length > 100 || r.notices.some(n => !text(n.name, 100) || n.counterpart !== null && !text(n.counterpart, 100) || !text(n.content, 1500)))) throw Error('INVALID_RESPONSE');
  return r;
}
