import Constants from 'expo-constants';
import { createPlaceClient } from './placesClient';

// Public endpoint only. No Kakao key, auth session, or secret is sent by app.
export const searchPlaces = (input: Parameters<ReturnType<typeof createPlaceClient>>[0], signal?: AbortSignal) =>
  createPlaceClient(process.env.EXPO_PUBLIC_PLACES_FUNCTION_URL?.trim()
    || Constants.expoConfig?.extra?.placesFunctionUrl)(input, signal);
