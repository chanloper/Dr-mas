import type { WearableAdapter, WearableRecord } from './contract';
import { createWearableMonitor } from './monitor';
import { normalizeSosDelay } from '../../services/sosDelay';

export const scenarios = ['daily', 'exercise', 'high', 'low', 'fall', 'disconnect', 'interrupted', 'reconnect'] as const;
export type Scenario = typeof scenarios[number];
export type SimulationFrame = {
  running: boolean; scenario: Scenario; connection: 'connected' | 'disconnected'; stale: boolean;
  bpm: number | null; steps: number | null; sleep: number | null; measuredAt: string | null;
  history: number[]; sosLeft: number | null; sosResult: 'none' | 'cancelled' | 'completed';
  sosEvent?: { id: string; occurredAt: string; completedAt?: string };
};

// Implements the same adapter contract as device providers, with explicit synthetic provenance.
export function createLiveSimulator(streamId: string) {
  let scenario: Scenario = 'daily', running = false, sequence = 0, steps = 0;
  let lastSample = -Infinity, deadline: number | null = null, pendingFall = false;
  let fallSequence = 0;
  let fallRecord: WearableRecord | undefined;
  let frame: SimulationFrame = { running, scenario, connection: 'disconnected', stale: false,
    bpm: null, steps: null, sleep: null, measuredAt: null, history: [], sosLeft: null, sosResult: 'none' };
  const source = Object.freeze({ kind: 'simulator' as const, provider: 'drmas-simulator', streamId });
  const adapter: WearableAdapter = {
    source,
    getStatus: () => ({ capabilities: ['heart-rate', 'activity-steps', 'sleep-duration', 'fall-event'],
      permissions: { 'heart-rate': 'granted', 'activity-steps': 'granted', 'sleep-duration': 'granted', 'fall-event': 'granted' },
      connection: running && scenario !== 'disconnect' ? 'connected' : 'disconnected',
      freshness: 'fresh', consentId: streamId }),
    read: async () => sample(Date.now()),
    verifiesFall: event => event === fallRecord,
  };
  const monitor = createWearableMonitor(adapter, { maxAgeMs: 6000, gapMs: 6000 });
  function sample(now: number): WearableRecord[] {
    if (!running || scenario === 'disconnect' || scenario === 'interrupted' || now - lastSample < 2000) return [];
    lastSample = now; sequence++;
    const base = scenario === 'exercise' ? 112 : scenario === 'high' ? 150 : scenario === 'low' ? 45 : 72;
    steps += scenario === 'exercise' ? 12 : 2;
    const metadata = { version: 1 as const, measuredAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(),
      source, quality: 'valid' as const, provenance: { consentId: streamId, origin: 'synthetic' as const } };
    const records: WearableRecord[] = [
      { ...metadata, id: `${sequence}-heart`, metric: 'heart-rate', value: base + Math.round(Math.sin(sequence) * 4), unit: 'bpm' },
      { ...metadata, id: `${sequence}-steps`, metric: 'activity-steps', value: steps, unit: 'steps' },
      { ...metadata, id: `${sequence}-sleep`, metric: 'sleep-duration', value: 7 + (sequence % 5) / 10, unit: 'hours' },
    ];
    return records;
  }
  function tick(now: number, delay: number): SimulationFrame {
    // A user-triggered fall is an event, not a periodic sensor sample. Consume it
    // immediately, even inside the 2-second sample interval or while stopped.
    const events: WearableRecord[] = [];
    if (pendingFall) {
      pendingFall = false;
      running = true;
      const at = new Date(now).toISOString();
      fallRecord = { version: 1, id: `fall-${++fallSequence}`, measuredAt: at, receivedAt: at,
        source, quality: 'valid', provenance: { consentId: streamId, origin: 'synthetic' },
        metric: 'fall-event', value: true, unit: 'event' };
      events.push(fallRecord);
    }
    for (const record of [...events, ...sample(now)]) {
      const outcome = monitor.ingest(record, now);
      if (outcome.status === 'confirm-fall' && deadline === null) {
        // Simulator-only terminal outcome. Never invokes production SOS/phone/network code.
        if (monitor.resolveFall(outcome.prompt, 'confirm', now) === 'simulation-confirmed') {
          deadline = now + normalizeSosDelay(delay) * 1000; frame.sosResult = 'none';
          frame.sosEvent = { id: `${streamId}-${fallSequence}-${now}`, occurredAt: new Date(now).toISOString() };
        }
      }
      if (outcome.status !== 'sample') continue;
      if (record.metric === 'heart-rate') { frame.bpm = record.value; frame.history = [...frame.history.slice(-29), record.value]; }
      if (record.metric === 'activity-steps') frame.steps = record.value;
      if (record.metric === 'sleep-duration') frame.sleep = record.value;
      frame.measuredAt = record.measuredAt;
    }
    if (deadline !== null && now >= deadline) {
      const completedAt = new Date(deadline).toISOString();
      deadline = null; frame.sosResult = 'completed';
      if (frame.sosEvent) frame.sosEvent = { ...frame.sosEvent, completedAt };
    }
    frame = { ...frame, running, scenario, connection: adapter.getStatus().connection === 'connected' ? 'connected' : 'disconnected',
      stale: frame.measuredAt !== null && now - Date.parse(frame.measuredAt) > 6000,
      sosLeft: deadline === null ? null : Math.ceil((deadline - now) / 1000) };
    return { ...frame, history: [...frame.history] };
  }
  return {
    adapter, tick,
    start() { running = true; lastSample = -Infinity; },
    stop() {
      running = false; pendingFall = false; deadline = null; frame.sosLeft = null;
      if (frame.sosResult !== 'completed') frame.sosResult = 'cancelled';
    },
    select(value: Scenario) { scenario = value; pendingFall = value === 'fall'; },
    cancel() { pendingFall = false; deadline = null; frame.sosLeft = null; frame.sosResult = 'cancelled'; },
  };
}
