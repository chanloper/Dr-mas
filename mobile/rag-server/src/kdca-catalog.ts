// Metadata only. Never place TOKEN values or authenticated URLs in this list.
export type KdcaContent = {
  contentId: string; expectedTitle: string; sourceUrl: string; tokenEnvName: string;
  tokenBinding: 'unconfirmed' | 'per-content' | 'shared-confirmed';
  request: { mode: 'unconfirmed' } | { mode: 'content-parameter'; parameter: 'cntntsSn' };
};
export const kdcaTermsUrl = 'https://health.kdca.go.kr/healthinfo/biz/health/portalUseGuidance/openApiReqst/openApiReqstRegist.do';
// Official guide/agency endpoint only. Not permission to send a TOKEN over HTTP.
export const kdcaOfficialEndpoint = 'http://api.kdca.go.kr/api/provide/healthInfo';
// Attached KDCA17-HEALTH-API01 guide. Runtime service/version still needs confirmation.
export const kdcaLimits = { maxResponseBytes: 10_000, minIntervalMs: 34, refreshIntervalMs: 24 * 60 * 60 * 1000 } as const;
// Engineering memory cap for offline review only, NOT an amended API specification.
export const kdcaOfflineReviewMaxBytes = 256_000;
export function requireKdcaLiveReady(env: Record<string, string | undefined>): void {
  if (env.KDCA_LIVE_FETCH_ENABLED !== 'true') throw Error('KDCA_LIVE_DISABLED');
  // A flag, URL or issued TOKEN is not explicit request approval or secure transport.
  // Deliberately no endpoint validation/probing or automatic HTTP/HTTPS substitution.
  throw Error('KDCA_SECURE_CONTRACT_UNCONFIRMED');
}
export const kdcaCatalog: readonly KdcaContent[] = [{
  contentId: '5830', expectedTitle: '두통',
  sourceUrl: 'https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5830',
  tokenEnvName: 'KDCA_HEALTHINFO_5830_TOKEN', tokenBinding: 'unconfirmed', request: { mode: 'content-parameter', parameter: 'cntntsSn' },
}];
export type KdcaTokenEncoding = 'decoded' | 'url-component';
// Encoding must be confirmed by the operator; never guess from percent signs.
// A raw query value uses percent decoding once, not form decoding (+ stays +).
export function normalizeKdcaToken(value: string, encoding: KdcaTokenEncoding = 'decoded'): string {
  if (!['decoded','url-component'].includes(encoding)) throw Error('KDCA_TOKEN_ENCODING_REQUIRED');
  let token: string;
  try { token = encoding === 'url-component' ? decodeURIComponent(value) : value; }
  catch { throw Error('KDCA_TOKEN_ENCODING_INVALID'); }
  if (!token || token.length > 4096 || /[\u0000-\u0020\u007f]/u.test(token) || /^https?:/i.test(token)) throw Error('KDCA_TOKEN_NOT_CONFIGURED');
  return token;
}
export function readKdcaToken(entry: KdcaContent, env: Record<string, string | undefined>, encoding: KdcaTokenEncoding = 'decoded'): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(entry.tokenEnvName) || entry.tokenEnvName.startsWith('EXPO_PUBLIC_')) throw Error('KDCA_PRIVATE_CONFIG_REQUIRED');
  const value = env[entry.tokenEnvName]?.trim();
  if (!value || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value)) throw Error('KDCA_TOKEN_NOT_CONFIGURED');
  return normalizeKdcaToken(value, encoding);
}
