import type { HeartRateRecord } from 'react-native-health-connect';

export type HeartReading = { bpm: number; time: string; origin: string; device?: string };
export const SAMSUNG_HEALTH = 'com.sec.android.app.shealth';

// Only actual samples in the requested window; never infer the measuring device.
export function latestHeartRate(records: Pick<HeartRateRecord, 'metadata' | 'samples'>[], start: number, end: number): HeartReading | null {
  let latest: HeartReading | null = null;
  for (const record of records) {
    if (record.metadata?.dataOrigin !== SAMSUNG_HEALTH || record.metadata.recordingMethod === 3) continue;
    for (const sample of record.samples ?? []) {
      const time = Date.parse(sample.time);
      if (!Number.isFinite(time) || time < start || time > end || !Number.isFinite(sample.beatsPerMinute) || sample.beatsPerMinute <= 0) continue;
      if (!latest || time > Date.parse(latest.time)) {
        const device = record.metadata.device;
        latest = { bpm: sample.beatsPerMinute, time: sample.time, origin: SAMSUNG_HEALTH,
          device: device ? [device.manufacturer, device.model].filter(Boolean).join(' ') || undefined : undefined };
      }
    }
  }
  return latest;
}
