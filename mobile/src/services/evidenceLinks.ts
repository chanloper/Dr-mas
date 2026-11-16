// Verified display-only companion link. Never replaces response provenance URLs
// and never grants external embedding/generation permission.
export function evidenceLinkInfo(termsUrl: string) {
  if (termsUrl === 'https://www.data.go.kr/catalog/15075057/openapi.json') {
    return { structuredRecord: true, guideUrl: 'https://www.data.go.kr/ugs/selectPortalPolicyView.do' };
  }
  return { structuredRecord: false, guideUrl: undefined };
}
