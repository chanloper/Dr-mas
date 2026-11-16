import { validateRagBaseUrl } from './ragClient';
export type HiraCoordinates = { latitude: number; longitude: number };
export type HiraQuery = ({ kind: 'disease'; query: string; by: 'name' | 'code' } | { kind: 'hospital'; name?: string; town?: string; coordinates?: HiraCoordinates }) & { page?: number; rows?: number };
export type DiseaseReference = { code: string; name: string; englishName: string | null };
export type HospitalReference = { id: string; name: string; address: string | null; phone: string | null; institutionType: string | null; coordinates: HiraCoordinates | null; distanceMeters: number | null };
export type HiraPage = { items: (DiseaseReference | HospitalReference)[]; page: number; rows: number; total: number; hasMore: boolean; truncated: boolean; source: { publisher: string; datasetUrl: string; fetchedAt: string; clinicalEvidence: false } };
export class HiraLookupError extends Error { constructor(public code: 'LOGIN' | 'CONFIG' | 'TIMEOUT' | 'CANCELLED' | 'NETWORK' | 'LIMITED' | 'INPUT' | 'LOCATION' | 'RESPONSE' | 'SERVER') { super(code); } }
export function hiraErrorMessage(error: unknown): string {
  const code = error instanceof HiraLookupError ? error.code : 'SERVER';
  return { LOGIN: '공공자료 조회는 로그인 후 이용할 수 있어요.', CONFIG: '공공자료 연결 설정을 확인해야 해요. 잠시 후 다시 시도해 주세요.',
    TIMEOUT: '공공자료를 확인하는 데 시간이 걸리고 있어요. 다시 시도해 주세요.', CANCELLED: '공공자료 조회를 취소했어요.',
    NETWORK: '공공자료 서버에 연결하지 못했어요. 연결 상태를 확인해 주세요.', LIMITED: '조회 요청이 많아요. 잠시 후 다시 시도해 주세요.',
    INPUT: '질병명·상병코드 또는 병원 검색 조건을 확인해 주세요.', LOCATION: '현재 위치를 확인하지 못했어요. 위치 권한을 확인하거나 병원명·읍면동으로 검색해 주세요.', RESPONSE: '공공자료 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', SERVER: '공공자료를 불러오지 못했어요. 다시 시도해 주세요.' }[code];
}
const invalid = (): never => { throw new HiraLookupError('RESPONSE'); };
function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) return invalid();
  return value;
}
export function validateHiraPage(input: unknown, query: HiraQuery): HiraPage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const r = input as Record<string, unknown>, source = r.source as Record<string, unknown> | undefined;
  const page = query.page ?? 1, rows = query.rows ?? 5;
  if (r.page !== page || r.rows !== rows || !Number.isSafeInteger(r.total) || (r.total as number) < 0 || !Array.isArray(r.items) || r.items.length > rows || r.items.length > (r.total as number)
    || r.hasMore !== (page * rows < (r.total as number) && page < 3) || r.truncated !== (page * rows < (r.total as number) && page === 3)
    || !source || source.clinicalEvidence !== false || source.publisher !== '건강보험심사평가원' || typeof source.fetchedAt !== 'string' || !Number.isFinite(Date.parse(source.fetchedAt))
    || source.datasetUrl !== `https://www.data.go.kr/data/${query.kind === 'disease' ? '15119055' : '15001698'}/openapi.do`) return invalid();
  const seen = new Set<string>();
  const items: HiraPage['items'] = [];
  for (const item of r.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return invalid();
    const v = item as Record<string, unknown>;
    if (query.kind === 'disease') {
      const code = text(v.code)!; const name = text(v.name)!; const englishName = text(v.englishName, true);
      if (!seen.has(code)) items.push({ code, name, englishName }); seen.add(code);
    } else {
      let coordinates: HiraCoordinates | null = null;
      if (v.coordinates !== null) {
        if (!v.coordinates || typeof v.coordinates !== 'object') return invalid();
        const c = v.coordinates as HiraCoordinates;
        if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) return invalid();
        coordinates = { latitude: c.latitude, longitude: c.longitude };
      }
      if (v.distanceMeters !== null && (typeof v.distanceMeters !== 'number' || !Number.isFinite(v.distanceMeters) || v.distanceMeters < 0 || !coordinates || !query.coordinates)) return invalid();
      const id = text(v.id)!;
      const entry: HospitalReference = { id, name: text(v.name)!, address: text(v.address, true), phone: text(v.phone, true), institutionType: text(v.institutionType, true), coordinates, distanceMeters: v.distanceMeters as number | null };
      if (!seen.has(id)) items.push(entry); seen.add(id);
    }
  }
  return { items, page, rows, total: r.total as number, hasMore: r.hasMore as boolean, truncated: r.truncated as boolean,
    source: { publisher: source.publisher, datasetUrl: source.datasetUrl, fetchedAt: source.fetchedAt, clinicalEvidence: false } };
}
async function body(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > 200000) return invalid();
  const reader = response.body?.getReader(); if (!reader) return invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 200000) return invalid(); chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return invalid(); }
  finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export async function requestHira(query: HiraQuery, options: { url?: string; development: boolean; token: () => Promise<string | null>; signal?: AbortSignal; transport?: typeof fetch; timeoutMs?: number }): Promise<HiraPage> {
  let base: URL; try { base = validateRagBaseUrl(options.url, options.development); } catch { throw new HiraLookupError('CONFIG'); }
  if (options.signal?.aborted) throw new HiraLookupError('CANCELLED');
  const controller = new AbortController(); let expired = false;
  const cancel = () => controller.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new HiraLookupError(expired ? 'TIMEOUT' : 'CANCELLED')); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
  const timer = setTimeout(() => { expired = true; controller.abort(); }, options.timeoutMs ?? 12000);
  try {
    return await Promise.race([aborted, (async () => {
      let token: string | null; try { token = await options.token(); } catch { throw new HiraLookupError('LOGIN'); }
      if (!token) throw new HiraLookupError('LOGIN');
      if (controller.signal.aborted) throw new HiraLookupError('CANCELLED');
      let response: Response;
      try { response = await (options.transport ?? fetch)(new URL('/api/hira/reference', base), { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(query), signal: controller.signal }); }
      catch { throw new HiraLookupError('NETWORK'); }
      if (controller.signal.aborted) throw new HiraLookupError('CANCELLED');
      if (response.status === 401 || response.status === 403) throw new HiraLookupError('LOGIN');
      if (response.status === 429) throw new HiraLookupError('LIMITED');
      if (response.status === 504) throw new HiraLookupError('TIMEOUT');
      if (response.status === 400) throw new HiraLookupError('INPUT');
      const data = await body(response, controller.signal);
      if (!response.ok) {
        const code = (data as { error?: unknown } | null)?.error;
        throw new HiraLookupError(['HIRA_NOT_CONFIGURED', 'HIRA_KEY_NOT_REGISTERED', 'HIRA_ACCESS_DENIED'].includes(String(code)) ? 'CONFIG' : 'SERVER');
      }
      return validateHiraPage(data, query);
    })()]);
  } catch (error) {
    if (controller.signal.aborted) throw new HiraLookupError(expired ? 'TIMEOUT' : 'CANCELLED');
    if (error instanceof HiraLookupError) throw error;
    throw new HiraLookupError('SERVER');
  } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort); options.signal?.removeEventListener('abort', cancel); }
}
