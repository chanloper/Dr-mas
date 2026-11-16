import { isWearableRecord, timestampMs } from './contract';
import type { WearableAdapter, WearableMetric, WearableRecord, WearableStatus } from './contract';

type SampleMetric = Exclude<WearableMetric, 'fall-event'>;

export type WearableMonitorRules = {
  maxAgeMs: number;
  gapMs: number;
  baseline?: Partial<Record<SampleMetric, { value: number; deviation: number }>>;
};

type FallPrompt = Readonly<{ eventId: string; kind: 'simulator' | 'device' }>;
type FallOutcome = 'dismissed' | 'unavailable' | 'simulation-confirmed' | 'offer-existing-manual-sos';
type Rejection = 'invalid' | 'unavailable' | 'stale' | 'duplicate' | 'out-of-order' | 'unverified' | 'capacity';

function allowsMetric(status: WearableStatus, metric: WearableMetric, consentId: string): boolean {
  return status.connection === 'connected' && status.freshness !== 'stale' &&
    status.consentId === consentId && status.capabilities.includes(metric) &&
    status.permissions[metric] === 'granted';
}

// Create one monitor per account, adapter and consent lifecycle. Keep it out of shared/global state.
export function createWearableMonitor(adapter: WearableAdapter, rules: WearableMonitorRules) {
  const { maxAgeMs, gapMs } = rules;
  const baseline = copyBaseline(rules.baseline);
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0 || !Number.isSafeInteger(gapMs) || gapMs <= 0) {
    throw new RangeError('Wearable timing rules must be positive integer milliseconds');
  }

  const { kind, provider, streamId } = adapter.source;
  const consentId = adapter.getStatus().consentId;
  const lastMeasured = new Map<WearableMetric, number>();
  const seen = new Map<string, number>();
  let pending: { prompt: FallPrompt; openedAt: number; expiresAt: number } | undefined;

  function available(metric: WearableMetric): boolean {
    return consentId !== null && allowsMetric(adapter.getStatus(), metric, consentId);
  }

  function ingest(input: unknown, now: number):
    | { status: Rejection }
    | { status: 'sample'; gap: boolean; baseline: 'unavailable' | 'within' | 'deviation' }
    | { status: 'confirm-fall'; prompt: FallPrompt } {
    if (!Number.isSafeInteger(now) || !isWearableRecord(input) || input.quality !== 'valid') {
      return { status: 'invalid' };
    }
    if (input.source.kind !== kind || input.source.provider !== provider ||
      input.source.streamId !== streamId || input.provenance.consentId !== consentId ||
      !available(input.metric)) return { status: 'unavailable' };

    const measured = timestampMs(input.measuredAt);
    if (timestampMs(input.receivedAt) > now) return { status: 'invalid' };
    if (now - measured > maxAgeMs) return { status: 'stale' };

    for (const [id, expiresAt] of seen) {
      if (now > expiresAt) seen.delete(id);
    }
    const key = JSON.stringify([input.metric, input.id]);
    if (seen.has(key)) return { status: 'duplicate' };
    const previous = lastMeasured.get(input.metric);
    if (previous !== undefined && measured <= previous) return { status: 'out-of-order' };
    if (seen.size >= 4096) return { status: 'capacity' };
    if (input.metric === 'fall-event' && !adapter.verifiesFall(input)) return { status: 'unverified' };

    seen.set(key, measured + maxAgeMs);
    lastMeasured.set(input.metric, measured);
    if (input.metric === 'fall-event') {
      const prompt = Object.freeze({ eventId: input.id, kind });
      pending = { prompt, openedAt: now, expiresAt: measured + maxAgeMs };
      return { status: 'confirm-fall', prompt };
    }

    const gap = previous !== undefined && measured - previous > gapMs;
    return { status: 'sample', gap, baseline: compareBaseline(input, baseline, gap) };
  }

  function resolveFall(prompt: FallPrompt, decision: 'confirm' | 'dismiss', now: number): FallOutcome {
    if (!pending || pending.prompt !== prompt) return 'unavailable';
    const { openedAt, expiresAt } = pending;
    pending = undefined;
    if (decision === 'dismiss') return 'dismissed';
    if (decision !== 'confirm' || !Number.isSafeInteger(now) || now > expiresAt ||
      now < openedAt || !available('fall-event')) return 'unavailable';
    // This result only allows presenting the existing manual SOS affordance.
    return kind === 'simulator' ? 'simulation-confirmed' : 'offer-existing-manual-sos';
  }

  return { ingest, resolveFall };
}

function copyBaseline(baseline: WearableMonitorRules['baseline']) {
  const copy: NonNullable<WearableMonitorRules['baseline']> = {};
  for (const metric of ['heart-rate', 'activity-steps', 'sleep-duration'] as const) {
    const reference = baseline?.[metric];
    if (reference === undefined) continue;
    if (!Number.isFinite(reference.value) || reference.value < 0 ||
      !Number.isFinite(reference.deviation) || reference.deviation <= 0) {
      throw new RangeError('Invalid wearable baseline');
    }
    copy[metric] = { ...reference };
  }
  return copy;
}

function compareBaseline(
  record: Exclude<WearableRecord, { metric: 'fall-event' }>,
  baseline: NonNullable<WearableMonitorRules['baseline']>,
  gap: boolean,
): 'unavailable' | 'within' | 'deviation' {
  const reference = baseline[record.metric];
  if (gap || !reference) return 'unavailable';
  return Math.abs(record.value - reference.value) > reference.deviation ? 'deviation' : 'within';
}
