// Pure public contract. No environment access, credentials or runtime samples.
export type Category = 'hospital' | 'pharmacy';
export type Coordinates = { latitude: number; longitude: number };
export type PlaceQuery = { category: Category; mode: 'nearby' | 'keyword'; query: string; coordinates?: Coordinates; page: number };
export type Place = { id: string; name: string; category: string; address: string; roadAddress: string; phone: string; distanceMeters: number | null; detailUrl: string };
export type PlaceResult = { places: Place[]; isEnd: boolean };
export const categoryCode = (category: Category) => category === 'hospital' ? 'HP8' : 'PM9';
export function validateQuery(value: unknown): PlaceQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_INPUT');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['category', 'mode', 'query', 'coordinates', 'page'].includes(key))) throw Error('INVALID_INPUT');
  if (!['hospital', 'pharmacy'].includes(v.category as string) || !['nearby', 'keyword'].includes(v.mode as string)) throw Error('INVALID_INPUT');
  if (typeof v.query !== 'string' || v.query.length > 80 || /[\u0000-\u001f\u007f]/.test(v.query)) throw Error('INVALID_INPUT');
  const query = v.query.trim();
  if (v.mode === 'keyword' && query.length < 2 || v.mode === 'nearby' && query !== '') throw Error('INVALID_INPUT');
  if (!Number.isInteger(v.page) || (v.page as number) < 1 || (v.page as number) > 3) throw Error('INVALID_INPUT');
  let coordinates: Coordinates | undefined;
  if (v.coordinates !== undefined) {
    if (!v.coordinates || typeof v.coordinates !== 'object' || Array.isArray(v.coordinates)) throw Error('INVALID_INPUT');
    const c = v.coordinates as Record<string, unknown>;
    if (Object.keys(c).some(key => !['latitude', 'longitude'].includes(key)) || typeof c.latitude !== 'number' || typeof c.longitude !== 'number'
      || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || Math.abs(c.latitude) > 90 || Math.abs(c.longitude) > 180) throw Error('INVALID_INPUT');
    coordinates = { latitude: c.latitude, longitude: c.longitude };
  }
  if (v.mode === 'nearby' && !coordinates) throw Error('INVALID_INPUT');
  return { category: v.category as Category, mode: v.mode as PlaceQuery['mode'], query, page: v.page as number, ...(coordinates ? { coordinates } : {}) };
}
export function safeDetailUrl(value: unknown): string {
  if (typeof value !== 'string') throw Error('INVALID_RESPONSE');
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.hostname !== 'place.map.kakao.com' || u.port || u.username || u.password || u.search || u.hash || !/^\/\d+$/.test(u.pathname)) throw Error('INVALID_RESPONSE');
  return `https://place.map.kakao.com${u.pathname}`;
}
function text(v: unknown): string { if (typeof v !== 'string' || v.length > 500) throw Error('INVALID_RESPONSE'); return v; }
export function normalizeKakao(value: unknown, request: PlaceQuery): PlaceResult {
  const v = value as { documents?: Record<string, unknown>[]; meta?: { is_end?: boolean } } | null;
  if (!v || !Array.isArray(v.documents) || v.documents.length > 15 || typeof v.meta?.is_end !== 'boolean') throw Error('INVALID_RESPONSE');
  const places = v.documents.map(d => {
    if (!d || typeof d !== 'object' || d.category_group_code !== categoryCode(request.category) || !/^\d+$/.test(text(d.id)) || !text(d.place_name).trim()) throw Error('INVALID_RESPONSE');
    const distance = request.coordinates && typeof d.distance === 'string' && /^\d+(\.\d+)?$/.test(d.distance) ? Number(d.distance) : null;
    return { id: text(d.id), name: text(d.place_name), category: text(d.category_name), address: text(d.address_name),
      roadAddress: text(d.road_address_name), phone: text(d.phone), distanceMeters: distance !== null && Number.isFinite(distance) ? distance : null, detailUrl: safeDetailUrl(d.place_url) };
  });
  return { places, isEnd: v.meta.is_end || request.page >= 3 };
}
export function validateResult(value: unknown): PlaceResult {
  const v = value as PlaceResult | null;
  if (!v || !Array.isArray(v.places) || v.places.length > 15 || typeof v.isEnd !== 'boolean') throw Error('INVALID_RESPONSE');
  const places = v.places.map(p => {
    if (!p || typeof p !== 'object' || !/^\d+$/.test(text(p.id)) || !text(p.name).trim()
      || p.distanceMeters !== null && (typeof p.distanceMeters !== 'number' || !Number.isFinite(p.distanceMeters) || p.distanceMeters < 0)) throw Error('INVALID_RESPONSE');
    return { id: text(p.id), name: text(p.name), category: text(p.category), address: text(p.address), roadAddress: text(p.roadAddress),
      phone: text(p.phone), distanceMeters: p.distanceMeters, detailUrl: safeDetailUrl(p.detailUrl) };
  });
  return { places, isEnd: v.isEnd };
}
