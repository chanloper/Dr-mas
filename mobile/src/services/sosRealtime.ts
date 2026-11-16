import type { SupabaseClient } from '@supabase/supabase-js';
import type { SosActor } from './sos';

export type SosConnection = 'connecting' | 'connected' | 'disconnected';
// Events are invalidation signals only. RLS-filtered repository reads remain
// authoritative; no event payload, identity or medical data is trusted here.
export function watchSos(client: SupabaseClient, actor: SosActor, changed: () => void,
  status: (state: SosConnection) => void): () => void {
  let stopped = false;
  let channel: ReturnType<SupabaseClient['channel']> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  async function connect() {
    const version = ++generation;
    status('connecting');
    try {
      const { data, error } = await client.auth.getUser();
      if (stopped) return;
      if (error || data.user?.id !== actor.id || !['patient', 'guardian'].includes(actor.role)) throw Error();
      channel = client.channel(`sos:${actor.role}:${actor.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts',
          filter: `${actor.role === 'guardian' ? 'guardian_id' : 'patient_id'}=eq.${actor.id}` }, () => {
          if (!stopped && version === generation) changed();
        }).subscribe(state => {
          if (stopped || version !== generation) return;
          if (state === 'SUBSCRIBED') { status('connected'); changed(); }
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) reconnect();
        });
    } catch { if (!stopped) reconnect(); }
  }
  function reconnect() {
    status('disconnected');
    if (retry) return;
    // Supabase also retries internally; recreate after a bounded delay and
    // reverify the user. A successful resubscription always refetches missed rows.
    retry = setTimeout(() => {
      retry = undefined;
      generation++;
      const previous = channel; channel = undefined;
      void (async () => {
        if (previous) await client.removeChannel(previous).catch(() => {});
        if (!stopped) await connect();
      })();
    }, 5000);
  }
  void connect();
  return () => {
    stopped = true;
    generation++;
    if (retry) clearTimeout(retry);
    if (channel) void client.removeChannel(channel).catch(() => {});
  };
}
