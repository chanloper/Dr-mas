import * as Location from 'expo-location';
import type { Coordinates } from './placesClient';

export class PlaceLocationError extends Error {
  constructor(public code: 'DENIED' | 'UNAVAILABLE') {
    super(code === 'DENIED' ? '위치 권한이 없어 주변 검색을 사용할 수 없습니다. 지역명이나 기관명으로 검색해 주세요.'
      : '현재 위치를 확인하지 못했습니다. 위치 서비스를 확인하거나 키워드로 검색해 주세요.');
  }
}
export async function currentPlaceLocation(): Promise<Coordinates> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') throw new PlaceLocationError('DENIED');
    if (!await Location.hasServicesEnabledAsync()) throw new PlaceLocationError('UNAVAILABLE');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PlaceLocationError('UNAVAILABLE')), 12000); }),
      ]);
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } finally { clearTimeout(timer); }
  } catch (e) { if (e instanceof PlaceLocationError) throw e; throw new PlaceLocationError('UNAVAILABLE'); }
}
