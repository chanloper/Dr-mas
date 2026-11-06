import Constants from 'expo-constants';
import { createPlaceClient, validatePlaceEndpoint } from './placesClient';

function endpoint() {
  const extra = Constants.expoConfig?.extra;
  const value = process.env.EXPO_PUBLIC_PLACES_FUNCTION_URL?.trim() || extra?.placesFunctionUrl;
  const project = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || extra?.supabase?.url;
  // Public endpoint only: never attach the user's JWT or a provider secret.
  // An explicit endpoint from another project must not silently replace Dev.
  return validatePlaceEndpoint(value, project);
}
export function placeSearchConfigured(): boolean {
  try { endpoint(); return true; } catch { return false; }
}

// Public endpoint only. No Kakao key, auth session, or secret is sent by app.
export const searchPlaces = (input: Parameters<ReturnType<typeof createPlaceClient>>[0], signal?: AbortSignal) =>
  createPlaceClient(endpoint())(input, signal);
