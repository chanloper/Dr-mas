import * as Location from 'expo-location';
import type { Coordinates } from './placesClient';
import { PlaceLocationError } from './placeLocationError';
export { PlaceLocationError } from './placeLocationError';
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
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new PlaceLocationError('UNAVAILABLE');
      return { latitude, longitude };
    } finally { clearTimeout(timer); }
  } catch (e) { if (e instanceof PlaceLocationError) throw e; throw new PlaceLocationError('UNAVAILABLE'); }
}
