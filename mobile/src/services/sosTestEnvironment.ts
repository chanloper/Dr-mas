import Constants from 'expo-constants';
import { matchesSupabaseProject } from './supabase';

// Client guard is defense in depth. The server separately checks JWT issuer,
// administrator-enabled test configuration, approved links and designated pairs.
export function sosTestEnvironmentAllowed(): boolean {
  const environment = Constants.expoConfig?.extra?.environment;
  const name = process.env.EXPO_PUBLIC_APP_ENV?.trim() || environment?.name;
  const ref = process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF?.trim() || environment?.expectedSupabaseRef;
  return name === 'development' && typeof ref === 'string' && matchesSupabaseProject(ref);
}
