import type { Category } from './placesClient';

// Navigation selects a tab only. It never carries a symptom, coordinates,
// keywords, or permission to start a network/location request.
export function placeRouteCategory(value: unknown): Category {
  return value === 'pharmacy' ? 'pharmacy' : 'hospital';
}
