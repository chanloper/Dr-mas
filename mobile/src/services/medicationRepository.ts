import type { SupabaseClient } from '@supabase/supabase-js';
export type CloudSchedule = { id: string; patient_id: string; title: string; detail: string; time_local: string; timezone: string; active: boolean };
export type CloudRecord = { medication_id: string; patient_id: string; day: string; taken: boolean; taken_at: string | null };
export type ScheduleInput = { title: string; detail: string; time_local: string };
export class MedicationError extends Error {
  constructor(public code: 'INPUT' | 'AUTH' | 'SERVER' | 'RESPONSE', message: string) { super(message); }
}
function invalid(): never { throw new MedicationError('INPUT', '일정 이름, 시간, 날짜를 확인해 주세요.'); }
export function validateId(id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) invalid();
  return id;
}
export function validateDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) invalid();
  return day;
}
function input(value: ScheduleInput): ScheduleInput {
  if (Object.keys(value).some(k => !['title', 'detail', 'time_local'].includes(k)) || typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200
    || typeof value.detail !== 'string' || value.detail.length > 2000 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time_local)) invalid();
  return { title: value.title.trim(), detail: value.detail.trim(), time_local: value.time_local };
}
function schedule(value: unknown, patient: string): CloudSchedule {
  const v = value as CloudSchedule | null;
  if (!v || v.patient_id !== patient || typeof v.id !== 'string' || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200 || typeof v.detail !== 'string' || v.detail.length > 2000
    || typeof v.time_local !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$/.test(v.time_local) || typeof v.timezone !== 'string' || !v.timezone || typeof v.active !== 'boolean') throw new MedicationError('RESPONSE', '서버의 복약 일정을 확인하지 못했습니다.');
  validateId(v.id);
  return { id: v.id, patient_id: v.patient_id, title: v.title, detail: v.detail, time_local: v.time_local, timezone: v.timezone, active: v.active };
}
function record(value: unknown, patient: string, day: string): CloudRecord {
  const v = value as CloudRecord | null;
  if (!v || v.patient_id !== patient || v.day !== day || typeof v.medication_id !== 'string' || typeof v.taken !== 'boolean'
    || v.taken && (typeof v.taken_at !== 'string' || !Number.isFinite(Date.parse(v.taken_at))) || !v.taken && v.taken_at !== null) throw new MedicationError('RESPONSE', '서버의 복약 기록을 확인하지 못했습니다.');
  validateId(v.medication_id);
  return { medication_id: v.medication_id, patient_id: v.patient_id, day: v.day, taken: v.taken, taken_at: v.taken_at };
}
const fields = 'id,patient_id,title,detail,time_local,timezone,active';
const recordFields = 'medication_id,patient_id,day,taken,taken_at';
// Client JWT and database RLS remain the authority. There is no admin client,
// role mutation, automatic local import or unauthenticated fallback.
export function createMedicationRepository(client: SupabaseClient) {
  async function actor(expected: string) {
    validateId(expected);
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== expected) throw new MedicationError('AUTH', '로그인 상태를 다시 확인해 주세요.');
  }
  function check(error: unknown) { if (error) throw new MedicationError('SERVER', '서버에서 복약 요청을 처리하지 못했습니다. 연결·권한을 확인하고 기록을 다시 불러와 주세요.'); }
  return {
    async list(patient: string): Promise<CloudSchedule[]> {
      validateId(patient);
      const { data, error } = await client.from('medications').select(fields).eq('patient_id', patient).order('time_local'); check(error);
      if (!Array.isArray(data)) throw new MedicationError('RESPONSE', '복약 일정 목록을 확인하지 못했습니다.');
      return data.map(row => schedule(row, patient));
    },
    async records(patient: string, day: string): Promise<CloudRecord[]> {
      validateId(patient); validateDay(day);
      const { data, error } = await client.from('medication_records').select(recordFields).eq('patient_id', patient).eq('day', day); check(error);
      if (!Array.isArray(data)) throw new MedicationError('RESPONSE', '복약 기록 목록을 확인하지 못했습니다.');
      return data.map(row => record(row, patient, day));
    },
    async create(patient: string, value: ScheduleInput): Promise<CloudSchedule> {
      const payload = input(value); await actor(patient);
      const { data, error } = await client.from('medications').insert({ ...payload, patient_id: patient, timezone: 'Asia/Seoul', active: true }).select(fields).single(); check(error);
      return schedule(data, patient);
    },
    async update(patient: string, id: string, value: ScheduleInput): Promise<CloudSchedule> {
      const payload = input(value); validateId(id); await actor(patient);
      const { data, error } = await client.from('medications').update(payload).eq('id', id).eq('patient_id', patient).select(fields).single(); check(error);
      return schedule(data, patient);
    },
    async archive(patient: string, id: string, active: boolean): Promise<CloudSchedule> {
      validateId(id); if (typeof active !== 'boolean') invalid(); await actor(patient);
      const { data, error } = await client.from('medications').update({ active }).eq('id', id).eq('patient_id', patient).select(fields).single(); check(error);
      return schedule(data, patient);
    },
    async remove(patient: string, id: string): Promise<void> {
      validateId(id); await actor(patient);
      // The existing FK rejects deletion when any historical records exist.
      // Never delete records first or weaken that database protection.
      const { data, error } = await client.from('medications').delete().eq('id', id).eq('patient_id', patient).select('id').single();
      if (error?.code === '23503') throw new MedicationError('INPUT', '복약 기록이 있는 일정은 삭제할 수 없습니다. 일정 보관을 이용해 주세요.');
      check(error);
      if (data?.id !== id) throw new MedicationError('RESPONSE', '일정 삭제 결과를 확인하지 못했습니다. 다시 불러와 확인해 주세요.');
    },
    async mark(patient: string, id: string, day: string, taken: boolean): Promise<CloudRecord> {
      validateId(id); validateDay(day); if (typeof taken !== 'boolean') invalid(); await actor(patient);
      const payload = { medication_id: id, patient_id: patient, day, taken, taken_at: taken ? new Date().toISOString() : null };
      const { data, error } = await client.from('medication_records').upsert(payload, { onConflict: 'medication_id,day' }).select(recordFields).single(); check(error);
      return record(data, patient, day);
    },
  };
}
