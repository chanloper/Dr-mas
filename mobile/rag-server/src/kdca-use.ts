import type { DocumentInput, MedicalDocument, State } from './model.js';
import { kdcaCatalog, kdcaLimits } from './kdca-catalog.js';
import { hasPermission } from './rights.js';

export type KdcaIntent = 'overview' | 'cause' | 'management' | 'diet' | 'prevention' | 'visit';
// Server-side review evidence, never inferred from possession of an API key.
export type KdcaUseReview = {
  contentId: string; contentHash: string; evidenceUrl: string; reviewer: string; reviewedAt: string;
  approvalConfirmed: boolean; purposeConfirmed: boolean; individualTermsConfirmed: boolean;
  linkNotificationConfirmed: boolean; storageConfirmed: boolean; indexingConfirmed: boolean;
  quotationConfirmed: boolean; originalUnchangedConfirmed: boolean; homeDisplayConfirmed: boolean;
  status: 'active' | 'revoked' | 'refresh_failed' | 'changed_pending_review';
  lastVerifiedAt: string;
  // Explicitly reviewed, contiguous ORIGINAL ranges; no generated summaries.
  ranges: { intent: KdcaIntent; start: number; end: number }[];
};
export function isKdcaDocument(doc: Pick<DocumentInput, 'id' | 'publisher' | 'sourceUrl'>): boolean {
  try { return doc.id.startsWith('kdca-') || doc.publisher.includes('질병관리청') || new URL(doc.sourceUrl).hostname === 'health.kdca.go.kr'; }
  catch { return true; }
}
function safeEvidenceUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash
    && ![...url.searchParams.keys()].some(key => /token|key|auth/i.test(key)); } catch { return false; }
}
export function kdcaUseAllowed(doc: MedicalDocument, now = Date.now()): boolean {
  const use = doc.rights.kdcaUse;
  const entry = kdcaCatalog.find(item => `kdca-${item.contentId}` === doc.id);
  if (!use || !entry || use.contentId !== entry.contentId || use.contentHash !== doc.contentHash
    || doc.sourceUrl !== entry.sourceUrl || doc.title !== entry.expectedTitle || doc.publisher !== '질병관리청 국가건강정보포털'
    || use.status !== 'active' || !use.reviewer?.trim() || !safeEvidenceUrl(use.evidenceUrl)) return false;
  if (![use.approvalConfirmed, use.purposeConfirmed, use.individualTermsConfirmed, use.linkNotificationConfirmed,
    use.storageConfirmed, use.indexingConfirmed, use.quotationConfirmed, use.originalUnchangedConfirmed].every(value => value === true)) return false;
  const verified = Date.parse(use.lastVerifiedAt), reviewed = Date.parse(use.reviewedAt);
  // Daily refresh is a conservative local cutoff, NOT a substitute for immediate
  // withdrawal/change notice handling. No network request is made here.
  if (!Number.isFinite(now) || !Number.isFinite(verified) || !Number.isFinite(reviewed)
    || verified > now || reviewed > now || now - verified >= kdcaLimits.refreshIntervalMs) return false;
  return Array.isArray(use.ranges) && use.ranges.length > 0 && use.ranges.every(range => range &&
    ['overview','cause','management','diet','prevention','visit'].includes(range.intent)
    && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0
    && range.end > range.start && range.end <= doc.content.length);
}
export function kdcaQuestionIntents(question: string): (KdcaIntent | 'unsupported')[] {
  const current = question.split('\n추가 질문:').at(-1)!.split('\n[문진 답변]\n')[0]!;
  const intents: KdcaIntent[] = [];
  if (/음식|식이|식사|먹어|먹으면|먹을|식단/u.test(current)) intents.push('diet');
  if (/관리|대처|집에서/u.test(current) || !/예방/u.test(current) && /어떻게\s*(?:해야|해요|하나요|하면)/u.test(current)) intents.push('management');
  if (/예방|예방법/u.test(current)) intents.push('prevention');
  if (/원인|이유|왜|질환/u.test(current)) intents.push('cause');
  if (/병원|진료|응급실|의료기관/u.test(current)) intents.push('visit');
  if (intents.length) return intents;
  if (/개요|설명|무엇|뭐예|어떤\s*증상/u.test(current)) return ['overview'];
  return !question.includes('\n추가 질문:') && /머리|두통|배가|복통|기침/u.test(current) && !/[?？]|나요|까요|돼요/u.test(current) ? ['overview'] : ['unsupported'];
}
export function kdcaQuoteForQuestion(doc: MedicalDocument, question: string, chunk: { start: number; end: number }): string | null {
  if (!kdcaUseAllowed(doc)) return null;
  const intents = kdcaQuestionIntents(question), ranges = doc.rights.kdcaUse!.ranges;
  // One contiguous passage must cover every requested intent. Missing coverage
  // abstains; an overview/prevention passage is never a diet/treatment answer.
  const candidate = ranges.find(range => range.start >= chunk.start && range.end <= chunk.end
    && intents.every(intent => ranges.some(other => other.start === range.start && other.end === range.end && other.intent === intent)));
  return candidate ? doc.content.slice(candidate.start, candidate.end) : null;
}
// Publication projection for the existing home-card shape. No repository writes,
// fabricated dates, summaries or network calls; callers must supply reviewed state.
export function kdcaHomeItems(state: State, now = Date.now()) {
  return Object.values(state.documents).filter(doc => doc.rights.permission !== 'test-only' && isKdcaDocument(doc) && kdcaUseAllowed(doc, now)
    && doc.rights.kdcaUse?.homeDisplayConfirmed === true && hasPermission(doc,'quotation')
    && hasPermission(doc,'local_search')).map(doc => ({
      contentId: doc.rights.kdcaUse!.contentId, title: doc.title, summary: null, category: '건강정보',
      publisher: doc.publisher, sourceUrl: doc.sourceUrl, originalId: doc.rights.kdcaUse!.contentId,
      publishedAt: doc.publishedAt, updatedAt: doc.updatedAt, content: doc.content, verification: 'verified' as const,
      validUntil: new Date(Date.parse(doc.rights.kdcaUse!.lastVerifiedAt)+kdcaLimits.refreshIntervalMs).toISOString(),
      termsLabel: doc.attribution?.termsLabel ?? doc.rights.terms, termsUrl: doc.attribution?.termsUrl,
      attributionNotice: `출처: 질병관리청 국가건강정보포털(health.kdca.go.kr), '${doc.title} ${doc.sourceUrl}'`,
    }));
}
