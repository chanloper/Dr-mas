import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { latestHeartRate, SAMSUNG_HEALTH, type HeartReading } from './heartRate';

export type HeartResult = { status: 'ready'; reading: HeartReading | null } | {
  status: 'unsupported' | 'build-required' | 'unavailable' | 'update-required' | 'denied' | 'error';
};
// Lazy loading keeps Expo Go, iOS and web from evaluating the native module.
async function native() {
  if (Platform.OS !== 'android') return null;
  if (Constants.executionEnvironment === 'storeClient') return null;
  return import('react-native-health-connect');
}
export async function readSamsungHeartRate(requestConsent: boolean): Promise<HeartResult> {
  if (Platform.OS !== 'android') return { status: 'unsupported' };
  if (Constants.executionEnvironment === 'storeClient') return { status: 'build-required' };
  try {
    const hc = await native();
    if (!hc) return { status: 'build-required' };
    const status = await hc.getSdkStatus();
    if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return {
      status: status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ? 'update-required' : 'unavailable',
    };
    if (!await hc.initialize()) return { status: 'unavailable' };
    const permissions = requestConsent
      ? await hc.requestPermission([{ accessType: 'read', recordType: 'HeartRate' }])
      : await hc.getGrantedPermissions();
    if (!permissions.some(p => p.recordType === 'HeartRate' && p.accessType === 'read')) return { status: 'denied' };
    const end = Date.now(), start = end - 7 * 86400000;
    let pageToken: string | undefined, reading: HeartReading | null = null;
    // Read every page before claiming the latest sample; cap runaway provider responses.
    for (let page = 0; page < 100; page++) {
      const result = await hc.readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() },
        dataOriginFilter: [SAMSUNG_HEALTH], ascendingOrder: false, pageSize: 1000, pageToken,
      });
      const candidate = latestHeartRate(result.records, start, end);
      if (candidate && (!reading || Date.parse(candidate.time) > Date.parse(reading.time))) reading = candidate;
      if (!result.pageToken) return { status: 'ready', reading };
      if (pageToken === result.pageToken) return { status: 'error' };
      pageToken = result.pageToken;
    }
    return { status: 'error' };
  } catch { return { status: 'error' }; } // Never log health data or native errors.
}

export async function openHeartPermissions(): Promise<boolean> {
  try { const hc = await native(); if (!hc) return false; hc.openHealthConnectSettings(); return true; }
  catch { return false; }
}
