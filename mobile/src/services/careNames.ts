import type { SupabaseClient } from '@supabase/supabase-js';
import type { CareActor, CareLink } from './careLinks';

export type CareName = { care_link_id: string; counterpart_id: string; display_name: string | null };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Approved additive RPC, fail closed when not deployed or not accessible.
// No arbitrary target IDs, profile-wide SELECT, admin keys or metadata fallback.
export async function readApprovedCareNames(client: SupabaseClient, actor: CareActor): Promise<CareName[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const task = async (): Promise<CareName[]> => {
      if (!uuid.test(actor.id)) return [];
      const user = await client.auth.getUser();
      if (user.error || user.data.user?.id !== actor.id) return [];
      if (controller.signal.aborted) return [];
      const { data, error } = await client.rpc('list_approved_care_names').abortSignal(controller.signal);
      if (error || !Array.isArray(data) || data.length > 500) return [];
      const seen = new Set<string>();
      for (const row of data) {
        if (!row || !uuid.test(row.care_link_id) || !uuid.test(row.counterpart_id) || row.counterpart_id === actor.id
          || seen.has(row.care_link_id) || row.display_name !== null && (typeof row.display_name !== 'string'
            || Array.from(row.display_name).length > 100)) return [];
        seen.add(row.care_link_id);
      }
      return data.map(row => ({ care_link_id: row.care_link_id, counterpart_id: row.counterpart_id, display_name: row.display_name }));
    };
    return await Promise.race([task(), new Promise<CareName[]>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve([]); }, 4000);
    })]);
  } catch { return []; }
  finally { if (timer) clearTimeout(timer); }
}
export function careNameLabel(row: { status: CareLink['status']; display_name?: string | null }): string {
  if (row.status !== 'approved' || row.display_name === undefined) return '이름 확인 불가';
  return row.display_name?.trim() || '이름 미등록';
}
export async function withCareNames(client: SupabaseClient, actor: CareActor, rows: CareLink[]) {
  const names = await readApprovedCareNames(client, actor);
  return rows.map(row => {
    const match = row.status === 'approved' && names.find(name => name.care_link_id === row.id
      && name.counterpart_id === (actor.role === 'patient' ? row.guardian_id : row.patient_id));
    return match ? { ...row, display_name: match.display_name } : row;
  });
}
