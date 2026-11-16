/** Only explicitly reviewed content may be supplied. No server/store access here. */
export type HealthNewsItem = {
  contentId: string; title: string; summary: string | null; category: string;
  publisher: string; sourceUrl: string; originalId?: string;
  publishedAt?: string | null; updatedAt?: string | null;
  content?: string; verification: 'verified';
  validUntil?: string; termsLabel?: string; termsUrl?: string; attributionNotice?: string;
};
// No reviewed home-feed content is available. Never invent news, excerpts or dates.
export const homeHealthNews: readonly HealthNewsItem[] = [];
export function reviewedHealthNews(items: readonly HealthNewsItem[]): HealthNewsItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    try {
      const url = new URL(item.sourceUrl);
      if (item.verification !== 'verified' || !item.contentId.trim() || !item.title.trim() || !item.publisher.trim() ||
        url.protocol !== 'https:' || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].some(key => /token|key|authorization/i.test(key)) || seen.has(item.contentId)) return false;
      if (item.validUntil !== undefined && (!Number.isFinite(Date.parse(item.validUntil)) || Date.parse(item.validUntil) <= Date.now())) return false;
      if (item.termsUrl) {
        const terms = new URL(item.termsUrl);
        if (terms.protocol !== 'https:' || terms.username || terms.password || terms.hash || [...terms.searchParams.keys()].some(key => /token|key|authorization/i.test(key))) return false;
      }
      seen.add(item.contentId); return true;
    } catch { return false; }
  });
}
export function healthNewsDate(item: HealthNewsItem): string {
  const value = item.updatedAt || item.publishedAt;
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10)) return '날짜 미제공';
  return `${item.updatedAt ? '갱신' : '게시'} ${value.slice(0, 10)}`;
}
export function healthNewsPage(offset: number, step: number, count: number): number {
  return count > 0 && step > 0 ? Math.min(count - 1, Math.max(0, Math.round(offset / step))) : 0;
}
export function healthNewsCardWidth(viewport: number): number { return Math.max(1, viewport - 28); }
