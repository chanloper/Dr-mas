import type { WearableAdapter, WearableFallEvent, WearableRecord, WearableSource } from './contract';

export function createWearableSimulator(now: number, includeFall = false): WearableAdapter {
  const source: Readonly<WearableSource> = Object.freeze({
    kind: 'simulator',
    provider: 'drmas-simulator',
    streamId: 'demo',
  });
  const consentId = 'demo-consent';
  const at = new Date(now).toISOString();
  const metadata = {
    version: 1,
    measuredAt: at,
    receivedAt: at,
    source,
    quality: 'valid',
    provenance: Object.freeze({ consentId, origin: 'synthetic' }),
  } as const;
  const samples: WearableRecord[] = [
    Object.freeze({ ...metadata, id: 'demo-heart-rate', metric: 'heart-rate', value: 72, unit: 'bpm' }),
    Object.freeze({ ...metadata, id: 'demo-steps', metric: 'activity-steps', value: 12, unit: 'steps' }),
  ];
  const fall: WearableFallEvent = Object.freeze({
    ...metadata, id: 'demo-fall', metric: 'fall-event', value: true, unit: 'event',
  });
  if (includeFall) samples.push(fall);

  return {
    source,
    getStatus: () => ({
      capabilities: ['heart-rate', 'activity-steps', 'fall-event'],
      permissions: { 'heart-rate': 'granted', 'activity-steps': 'granted', 'fall-event': 'granted' },
      connection: 'connected',
      freshness: 'unknown',
      consentId,
    }),
    read: async () => samples.slice(),
    verifiesFall: event => includeFall && event === fall,
  };
}
