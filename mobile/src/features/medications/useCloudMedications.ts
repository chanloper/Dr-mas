import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';
import { createMedicationRepository, MedicationError, type CloudSchedule, type CloudRecord, type ScheduleInput } from '../../services/medicationRepository';
import type { AuthUser } from '../../services/auth';

export function koreaDay(): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function useCloudMedications(user: AuthUser) {
  const [day, setDay] = useState(koreaDay);
  const [data, setData] = useState<{ owner: string; schedules: CloudSchedule[]; records: CloudRecord[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false), [reload, setReload] = useState(0);
  const generation = useRef(0), lock = useRef(false);
  const invalidate = useCallback(() => { generation.current++; lock.current = false; }, []);
  useEffect(() => {
    let active = true; const epoch = ++generation.current;
    async function load() {
      lock.current = true; setBusy(true); setReady(false); setData(null); setError(null);
      try {
        const repository = createMedicationRepository(getSupabaseClient());
        const [schedules, records] = await Promise.all([repository.list(user.id), repository.records(user.id, day)]);
        if (active && generation.current === epoch) { setData({ owner: user.id, schedules, records }); setReady(true); }
      } catch (e) { if (active && generation.current === epoch) setError(e instanceof MedicationError ? e.message : '서버 복약 정보를 불러오지 못했습니다. 다시 확인해 주세요.'); }
      finally { if (active && generation.current === epoch) { lock.current = false; setBusy(false); } }
    }
    if (user.role === 'patient') void load();
    return () => { active = false; invalidate(); };
  }, [user.id, user.role, day, reload, invalidate]);
  async function mutate(action: 'create' | 'update' | 'archive' | 'mark', id: string, value: ScheduleInput | boolean): Promise<boolean> {
    if (lock.current || !ready || user.role !== 'patient' || data?.owner !== user.id) return false;
    lock.current = true; setBusy(true); setError(null); const epoch = generation.current;
    try {
      const repository = createMedicationRepository(getSupabaseClient());
      if (action === 'mark') {
        const row = await repository.mark(user.id, id, day, value as boolean);
        if (epoch !== generation.current) return false;
        setData(old => old?.owner === user.id ? { ...old, records: [...old.records.filter(r => r.medication_id !== row.medication_id), row] } : old);
      } else {
        const row = action === 'create' ? await repository.create(user.id, value as ScheduleInput)
          : action === 'update' ? await repository.update(user.id, id, value as ScheduleInput) : await repository.archive(user.id, id, value as boolean);
        if (epoch !== generation.current) return false;
        setData(old => old?.owner === user.id ? { ...old, schedules: [...old.schedules.filter(s => s.id !== row.id), row].sort((a, b) => a.time_local.localeCompare(b.time_local)) } : old);
      }
      return true;
    } catch (e) {
      if (epoch === generation.current) {
        // A timeout can follow a committed write. Require a read before retry;
        // never auto-repeat creation/upsert or write an optimistic rollback.
        if (!(e instanceof MedicationError && e.code === 'INPUT')) setReady(false);
        setError(e instanceof MedicationError ? e.message : '처리 결과를 확인하지 못했습니다. 다시 불러온 후 확인해 주세요.');
      }
      return false;
    } finally { if (epoch === generation.current) { lock.current = false; setBusy(false); } }
  }
  function refresh() { if (lock.current) return; generation.current++; setReady(false); setData(null); setReload(v => v + 1); }
  function changeDay(value: string) { if (lock.current || value === day) return; generation.current++; setReady(false); setData(null); setDay(value); }
  return { day, changeDay, schedules: data?.owner === user.id ? data.schedules : [], records: data?.owner === user.id ? data.records : [], ready, busy, error, refresh, mutate };
}
