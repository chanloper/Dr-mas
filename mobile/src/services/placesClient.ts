import { validateQuery, validateResult, type PlaceQuery, type PlaceResult } from './placeContract';
export type { Category, Coordinates, Place, PlaceQuery, PlaceResult } from '../../../supabase/functions/_shared/placeContract';
const messages: Record<string, string> = {
  CONFIG: '의료기관 검색 서버가 설정되지 않았습니다.', INVALID_INPUT: '지역명이나 기관명을 2~80자로 입력해 주세요.',
  FUNCTION_NOT_DEPLOYED: '의료기관 검색 서버를 찾을 수 없습니다. 서비스 연결 준비가 필요합니다.',
  PUBLIC_DISABLED: '의료기관 검색 서비스가 아직 활성화되지 않았습니다.',
  KAKAO_NOT_CONFIGURED: '검색 서버의 카카오 API 키가 설정되지 않았습니다.', KAKAO_KEY_REJECTED: '검색 서버의 API 키 설정을 확인해야 합니다.',
  NOT_CONFIGURED: '검색 서버의 공개 호출 보호 설정이 준비되지 않았습니다.', LIMITER_UNAVAILABLE: '검색 요청 보호 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  RATE_LIMITED: '검색 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', PROVIDER_LIMITED: '검색 제공자의 사용 한도에 도달했습니다. 나중에 다시 시도해 주세요.',
  NETWORK: '검색 서버에 연결하지 못했습니다. 인터넷 연결과 서버 준비 상태를 확인해 주세요.',
  WEB_NETWORK: '검색 서버에 연결하지 못했어요. 인터넷 연결 또는 이 웹 주소의 접근 허용 설정을 확인해야 해요.',
  INVALID_RESPONSE: '검색 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  UNAVAILABLE: '검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  ORIGIN_DENIED: '현재 웹 주소에서는 검색 서비스를 이용할 수 없습니다.',
};
export class PlacesError extends Error {
  constructor(public code: string) { super(messages[code] ?? messages.UNAVAILABLE); }
}
export function validatePlaceEndpoint(endpoint: string | undefined, expectedProjectUrl?: string): string {
  try {
    const url = new URL(endpoint?.trim() ?? '');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/functions/v1/search-places') throw Error();
    if (expectedProjectUrl) {
      const project = new URL(expectedProjectUrl);
      if (project.protocol !== 'https:' || project.port || project.username || project.password || project.search || project.hash || project.pathname !== '/' || project.hostname !== url.hostname) throw Error();
    }
    return url.toString();
  } catch { throw new PlacesError('CONFIG'); }
}
export function createPlaceClient(endpoint: string | undefined, fetcher: typeof fetch = fetch) {
  return async (input: PlaceQuery, signal?: AbortSignal): Promise<PlaceResult> => {
    let query: PlaceQuery;
    try { query = validateQuery(input); } catch { throw new PlacesError('INVALID_INPUT'); }
    const url = validatePlaceEndpoint(endpoint);
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query), signal: controller.signal });
      if (response.status === 404) throw new PlacesError('FUNCTION_NOT_DEPLOYED');
      const data: unknown = await response.json();
      if (!response.ok) {
        const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined;
        throw new PlacesError(typeof code === 'string' && Object.hasOwn(messages, code) ? code : response.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE');
      }
      try { return validateResult(data); } catch { throw new PlacesError('INVALID_RESPONSE'); }
    } catch (e) {
      if (e instanceof PlacesError) throw e;
      // Browsers hide blocked CORS responses as a network error. Do not claim
      // to know which one failed; keep native error behavior unchanged.
      throw new PlacesError(typeof window !== 'undefined' ? 'WEB_NETWORK' : 'NETWORK');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
