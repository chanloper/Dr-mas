import type { Coordinates } from './placesClient';
import { PlaceLocationError } from './placeLocationError';
export { PlaceLocationError } from './placeLocationError';

// Browser geolocation also works when the Permissions Query API is unavailable.
// Invoked only by the existing explicit nearby-search action, never on mount.
export async function currentPlaceLocation(): Promise<Coordinates> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) throw new PlaceLocationError('UNAVAILABLE');
  if (!window.isSecureContext) throw new PlaceLocationError('INSECURE');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        reject(new PlaceLocationError('UNAVAILABLE')); return;
      }
      resolve({ latitude, longitude });
    }, error => reject(new PlaceLocationError(error.code === 1 ? 'DENIED' : 'UNAVAILABLE')),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
  });
}
