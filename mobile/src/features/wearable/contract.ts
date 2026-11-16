export type WearableMetric = 'heart-rate' | 'activity-steps' | 'sleep-duration' | 'fall-event';
export type WearableSource = {
  kind: 'simulator' | 'device';
  provider: string;
  streamId: string;
};

type RecordMetadata = {
  version: 1;
  id: string;
  measuredAt: string;
  receivedAt: string;
  source: WearableSource;
  quality: 'valid' | 'uncertain' | 'invalid';
  provenance: { consentId: string; origin: 'synthetic' | 'provider' };
};

export type WearableRecord = RecordMetadata & (
  | { metric: 'heart-rate'; value: number; unit: 'bpm' }
  | { metric: 'activity-steps'; value: number; unit: 'steps' }
  | { metric: 'sleep-duration'; value: number; unit: 'hours' }
  | { metric: 'fall-event'; value: true; unit: 'event' }
);

export type WearableFallEvent = Extract<WearableRecord, { metric: 'fall-event' }>;

export type WearableStatus = {
  capabilities: readonly WearableMetric[];
  permissions: Readonly<Partial<Record<WearableMetric, 'unknown' | 'denied' | 'granted'>>>;
  connection: 'disconnected' | 'connecting' | 'connected' | 'unavailable';
  freshness: 'unknown' | 'fresh' | 'stale';
  consentId: string | null;
};

export interface WearableAdapter {
  readonly source: Readonly<WearableSource>;
  getStatus(): WearableStatus;
  read(): Promise<readonly WearableRecord[]>;
  // Trust belongs to the adapter and its provider evidence, never a flag on a payload.
  verifiesFall(event: WearableFallEvent): boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && value.trim().length > 0;
}

export function timestampMs(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return NaN;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}

export function isWearableRecord(record: unknown): record is WearableRecord {
  if (!isObject(record) || record.version !== 1 || !isIdentifier(record.id)) return false;
  const { source, provenance, quality, metric, value, unit } = record;
  if (!isObject(source) || !isObject(provenance) || !isIdentifier(provenance.consentId)) return false;
  if (!isIdentifier(source.provider) || !isIdentifier(source.streamId)) return false;
  if (source.kind === 'simulator' ? provenance.origin !== 'synthetic' :
    source.kind !== 'device' || provenance.origin !== 'provider') return false;
  if (quality !== 'valid' && quality !== 'uncertain' && quality !== 'invalid') return false;
  const measured = timestampMs(record.measuredAt);
  if (!(measured <= timestampMs(record.receivedAt))) return false;

  switch (metric) {
    case 'heart-rate':
      return unit === 'bpm' && typeof value === 'number' && Number.isFinite(value) && value > 0;
    case 'activity-steps':
      return unit === 'steps' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    case 'fall-event':
      return unit === 'event' && value === true;
    case 'sleep-duration':
      return unit === 'hours' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24;
    default:
      return false;
  }
}
