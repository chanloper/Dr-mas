// Public reference adapters only. No credentials, environment access or clinical
// inference in this module. Callers supply a server-side key and transport.
export class HiraError extends Error {
  constructor(public code: 'INVALID_INPUT' | 'NOT_CONFIGURED' | 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'KEY_NOT_REGISTERED' | 'ACCESS_DENIED' | 'LIMITED' | 'PROVIDER' | 'INVALID_XML' | 'INVALID_RESPONSE' | 'RESPONSE_TOO_LARGE' | 'CANCELLED') { super(code); }
}
type XmlNode = { name: string; text: string; children: XmlNode[] };
function decode(text: string): string {
  return text.replace(/&([^;\s]+);|&/g, (_whole, entity: string | undefined) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity && Object.hasOwn(named, entity)) return named[entity]!;
    if (!entity || !/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) throw new HiraError('INVALID_XML');
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isInteger(code) || code > 0x10ffff || code < 32 && ![9, 10, 13].includes(code) || code >= 0xd800 && code <= 0xdfff || [0xfffe, 0xffff].includes(code)) throw new HiraError('INVALID_XML');
    return String.fromCodePoint(code);
  });
}
// Deliberately restricted XML: no DTD, external entities, comments or processing
// instructions. CDATA is literal text; markup is never rendered as HTML.
export function parseHiraXml(xml: string): XmlNode {
  if (new TextEncoder().encode(xml).length > 200000) throw new HiraError('RESPONSE_TOO_LARGE');
  if (/<!DOCTYPE|<!ENTITY|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/i.test(xml)) throw new HiraError('INVALID_XML');
  const input = xml.replace(/^\ufeff?\s*<\?xml\s[^?]*\?>/, '');
  const container: XmlNode = { name: '', text: '', children: [] }, stack = [container];
  const tokens = input.match(/<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g) ?? [];
  if (tokens.join('') !== input || tokens.length > 20000) throw new HiraError('INVALID_XML');
  for (const token of tokens) {
    const parent = stack.at(-1)!;
    if (token.startsWith('<![CDATA[')) { if (stack.length < 2) throw new HiraError('INVALID_XML'); parent.text += token.slice(9, -3); }
    else if (token.startsWith('</')) {
      const match = /^<\/([A-Za-z][\w]*)\s*>$/.exec(token);
      if (!match || stack.length < 2 || parent.name !== match[1]) throw new HiraError('INVALID_XML');
      stack.pop();
    } else if (token.startsWith('<')) {
      const match = /^<([A-Za-z][\w]*)\s*(\/?)>$/.exec(token);
      if (!match || stack.length > 16) throw new HiraError('INVALID_XML');
      const node: XmlNode = { name: match[1]!, text: '', children: [] }; parent.children.push(node);
      if (!match[2]) stack.push(node);
    } else parent.text += decode(token);
  }
  if (stack.length !== 1 || container.children.length !== 1 || container.text.trim()) throw new HiraError('INVALID_XML');
  return container.children[0]!;
}
function child(node: XmlNode, name: string): XmlNode | undefined {
  const matches = node.children.filter(n => n.name === name);
  if (matches.length > 1) throw new HiraError('INVALID_RESPONSE');
  return matches[0];
}
function value(node: XmlNode, name: string): string {
  const n = child(node, name);
  if (n?.children.length || (n?.text.length ?? 0) > 1000) throw new HiraError('INVALID_RESPONSE');
  return n?.text.trim() ?? '';
}
function integer(text: string): number {
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new HiraError('INVALID_RESPONSE');
  return Number(text);
}
export type Coordinates = { latitude: number; longitude: number };
export type DiseaseReference = { code: string; name: string; englishName: string | null };
export type HospitalReference = { id: string; name: string; address: string | null; phone: string | null; institutionType: string | null; coordinates: Coordinates | null; distanceMeters: number | null };
export type ReferencePage<T> = { items: T[]; page: number; rows: number; total: number; hasMore: boolean; truncated: boolean;
  source: { publisher: string; datasetUrl: string; fetchedAt: string; clinicalEvidence: false } };
type Paging = { page?: number; rows?: number };
export type HiraQuery = ({ kind: 'disease'; query: string; by: 'name' | 'code'; sickType?: '1' | '2'; medicineType?: '1' | '2' } | { kind: 'hospital'; name?: string; town?: string; departmentCode?: string; coordinates?: Coordinates }) & Paging;
export function readHiraQuery(input: unknown): HiraQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HiraError('INVALID_INPUT');
  const q = input as Record<string, unknown>;
  const allowed = q.kind === 'disease' ? ['kind', 'query', 'by', 'sickType', 'medicineType', 'page', 'rows'] : ['kind', 'name', 'town', 'departmentCode', 'coordinates', 'page', 'rows'];
  if (Object.keys(q).some(k => !allowed.includes(k))) throw new HiraError('INVALID_INPUT');
  for (const key of ['page', 'rows']) if (q[key] !== undefined && typeof q[key] !== 'number') throw new HiraError('INVALID_INPUT');
  for (const key of ['sickType', 'medicineType', 'departmentCode']) if (q[key] !== undefined && typeof q[key] !== 'string') throw new HiraError('INVALID_INPUT');
  if (q.coordinates !== undefined && (!q.coordinates || typeof q.coordinates !== 'object' || Array.isArray(q.coordinates) || Object.keys(q.coordinates).some(k => !['latitude', 'longitude'].includes(k)))) throw new HiraError('INVALID_INPUT');
  const query = q as HiraQuery; hiraRequest(query); return query;
}
function location(value: Coordinates): Coordinates {
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number' || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) throw new HiraError('INVALID_INPUT');
  return value;
}
export function hiraRequest(query: HiraQuery): { url: URL; page: number; rows: number } {
  const page = query.page ?? 1, rows = query.rows ?? 5;
  if (!Number.isInteger(page) || page < 1 || page > 3 || !Number.isInteger(rows) || rows < 1 || rows > 10) throw new HiraError('INVALID_INPUT');
  const url = new URL(query.kind === 'disease' ? 'https://apis.data.go.kr/B551182/diseaseInfoService1/getDissNameCodeList1' : 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList');
  url.searchParams.set('pageNo', String(page)); url.searchParams.set('numOfRows', String(rows));
  if (query.kind === 'disease') {
    if (!['name', 'code'].includes(query.by) || !['1', '2'].includes(query.sickType ?? '1') || !['1', '2'].includes(query.medicineType ?? '1') || typeof query.query !== 'string' || !query.query.trim() || query.query.length > 60 || /[\u0000-\u001f\u007f]/.test(query.query) || query.by === 'code' && !/^[A-Za-z][0-9A-Za-z.]{1,9}$/.test(query.query.trim())) throw new HiraError('INVALID_INPUT');
    url.searchParams.set('sickType', query.sickType ?? '1'); url.searchParams.set('medTp', query.medicineType ?? '1');
    url.searchParams.set('diseaseType', query.by === 'code' ? 'SICK_CD' : 'SICK_NM'); url.searchParams.set('searchText', query.query.trim());
  } else if (query.kind === 'hospital') {
    if (query.name !== undefined && (typeof query.name !== 'string' || query.name.trim().length < 2 || query.name.length > 60 || /[\u0000-\u001f\u007f]/.test(query.name))) throw new HiraError('INVALID_INPUT');
    if (query.town !== undefined && (typeof query.town !== 'string' || query.town.trim().length < 2 || query.town.length > 40 || /[\u0000-\u001f\u007f]/.test(query.town))) throw new HiraError('INVALID_INPUT');
    if (!query.name && !query.town && !query.coordinates) throw new HiraError('INVALID_INPUT');
    if (query.name) url.searchParams.set('yadmNm', query.name.trim());
    if (query.town) url.searchParams.set('emdongNm', query.town.trim());
    if (query.departmentCode !== undefined) { if (!/^\d{2}$/.test(query.departmentCode)) throw new HiraError('INVALID_INPUT'); url.searchParams.set('dgsbjtCd', query.departmentCode); }
    if (query.coordinates) { const c = location(query.coordinates); url.searchParams.set('xPos', String(c.longitude)); url.searchParams.set('yPos', String(c.latitude)); url.searchParams.set('radius', '3000'); }
  } else throw new HiraError('INVALID_INPUT');
  return { url, page, rows };
}
function distance(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180, x = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x))));
}
export function parseHiraPage(xml: string, query: HiraQuery, fetchedAt = new Date().toISOString()): ReferencePage<DiseaseReference | HospitalReference> {
  const request = hiraRequest(query), root = parseHiraXml(xml);
  const gateway = child(root, 'cmmMsgHeader'), header = child(root, 'header');
  const code = gateway ? value(gateway, 'returnReasonCode') : header ? value(header, 'resultCode') : '';
  if (code === '30') throw new HiraError('KEY_NOT_REGISTERED');
  if (['20', '21', '31', '32'].includes(code)) throw new HiraError('ACCESS_DENIED');
  if (['22', '23'].includes(code)) throw new HiraError('LIMITED');
  if (!gateway && !header) throw new HiraError('INVALID_RESPONSE');
  if (gateway || code !== '00') throw new HiraError('PROVIDER');
  if (root.name !== 'response') throw new HiraError('INVALID_RESPONSE');
  const body = child(root, 'body'); if (!body) throw new HiraError('INVALID_RESPONSE');
  const page = integer(value(body, 'pageNo')), rows = integer(value(body, 'numOfRows')), total = integer(value(body, 'totalCount'));
  if (page !== request.page || rows !== request.rows) throw new HiraError('INVALID_RESPONSE');
  const entries = child(body, 'items')?.children ?? [];
  if (entries.length !== Math.min(rows, Math.max(0, total - (page - 1) * rows)) || entries.some(n => n.name !== 'item')) throw new HiraError('INVALID_RESPONSE');
  const items = entries.map(node => {
    if (query.kind === 'disease') {
      const code = value(node, 'sickCd'), name = value(node, 'sickNm');
      if (!code || !name) throw new HiraError('INVALID_RESPONSE');
      return { code, name, englishName: value(node, 'sickEngNm') || null };
    }
    const id = value(node, 'ykiho'), name = value(node, 'yadmNm');
    if (!id || !name) throw new HiraError('INVALID_RESPONSE');
    const x = value(node, 'XPos'), y = value(node, 'YPos');
    let coordinates: Coordinates | null = null;
    if (x && y && Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Number(x) !== 0 && Number(y) !== 0 && Math.abs(Number(x)) <= 180 && Math.abs(Number(y)) <= 90) coordinates = { longitude: Number(x), latitude: Number(y) };
    return { id, name, address: value(node, 'addr') || null, phone: value(node, 'telno') || null, institutionType: value(node, 'clCdNm') || null, coordinates,
      distanceMeters: query.coordinates && coordinates ? distance(query.coordinates, coordinates) : null };
  });
  // Only this page is sorted. A paginated provider response is not a globally
  // nearest-first list; callers must retain that distinction.
  if (query.kind === 'hospital' && query.coordinates) items.sort((a, b) => ((a as HospitalReference).distanceMeters ?? Infinity) - ((b as HospitalReference).distanceMeters ?? Infinity));
  return { items, page, rows, total, hasMore: page * rows < total && page < 3, truncated: page * rows < total && page === 3,
    source: { publisher: '건강보험심사평가원', datasetUrl: query.kind === 'disease' ? 'https://www.data.go.kr/data/15119055/openapi.do' : 'https://www.data.go.kr/data/15001698/openapi.do', fetchedAt, clinicalEvidence: false } };
}
export function createHiraClient(options: { key: string | undefined; transport?: typeof fetch; timeoutMs?: number }) {
  return async (query: HiraQuery, signal?: AbortSignal): Promise<ReferencePage<DiseaseReference | HospitalReference>> => {
    const { url } = hiraRequest(query);
    if (signal?.aborted) throw new HiraError('CANCELLED');
    if (!options.key?.trim()) throw new HiraError('NOT_CONFIGURED');
    let key: string; try { key = decodeURIComponent(options.key.trim()); } catch { throw new HiraError('NOT_CONFIGURED'); }
    url.searchParams.set(query.kind === 'disease' ? 'serviceKey' : 'ServiceKey', key);
    const controller = new AbortController(), cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true });
    let expired = false, timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; controller.abort(); reject(new HiraError('TIMEOUT')); }, options.timeoutMs ?? 6000); });
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new HiraError(expired ? 'TIMEOUT' : 'CANCELLED')); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
    try {
      return await Promise.race([timeout, aborted, (async () => {
        const response = await (options.transport ?? fetch)(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/xml' } });
        if (response.status === 429) { await response.body?.cancel(); throw new HiraError('LIMITED'); }
        if (Number(response.headers.get('content-length')) > 200000) { await response.body?.cancel(); throw new HiraError('RESPONSE_TOO_LARGE'); }
        const reader = response.body?.getReader(); if (!reader) throw new HiraError('INVALID_RESPONSE');
        const abort = () => { void reader.cancel().catch(() => undefined); }; controller.signal.addEventListener('abort', abort, { once: true });
        const parts: Uint8Array[] = []; let size = 0;
        try { while (true) { const chunk = await reader.read(); if (controller.signal.aborted) throw new HiraError(expired ? 'TIMEOUT' : 'CANCELLED'); if (chunk.done) break; size += chunk.value.length; if (size > 200000) throw new HiraError('RESPONSE_TOO_LARGE'); parts.push(chunk.value); } }
        finally { controller.signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
        let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new HiraError('INVALID_XML'); }
        if (!response.ok) {
          try { parseHiraPage(text, query); }
          catch (error) { if (error instanceof HiraError && ['KEY_NOT_REGISTERED', 'ACCESS_DENIED', 'LIMITED', 'PROVIDER'].includes(error.code)) throw error; }
          throw new HiraError('HTTP');
        }
        return parseHiraPage(text, query);
      })()]);
    } catch (error) {
      if (signal?.aborted) throw new HiraError('CANCELLED');
      if (expired) throw new HiraError('TIMEOUT');
      if (error instanceof HiraError) throw error;
      throw new HiraError('NETWORK');
    } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort); signal?.removeEventListener('abort', cancel); }
  };
}

// Supabase server-side consumers keep the existing Secret name. This function
// never falls back to a mobile/public environment variable or a different key.
export const createHiraServerClient = (env: (name: string) => string | undefined, transport?: typeof fetch) =>
  createHiraClient({ key: env('MFDS_DUR_SERVICE_KEY'), transport });
