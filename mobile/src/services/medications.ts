import { getSupabaseClient } from './supabase';

export type MedicationSchedule = { id: string; patient_id: string; title: string; detail: string; time_local: string; timezone: string; active: boolean };
export type MedicationRecord = { medication_id: string; patient_id: string; day: string; taken: boolean; taken_at: string | null };
export type CareLink = { id: string; patient_id: string; guardian_id: string; status: 'pending' | 'approved' | 'revoked' };

// Prepared cloud data layer only. Existing local medication UI/storage is not
// silently uploaded, reinterpreted as a prescription, or changed by these helpers.
export async function listMedications(patientId: string): Promise<MedicationSchedule[]> {
  const { data, error } = await getSupabaseClient().from('medications').select('id,patient_id,title,detail,time_local,timezone,active').eq('patient_id', patientId).order('time_local');
  if (error) throw new Error('복약 일정을 불러오지 못했습니다.');
  return data as MedicationSchedule[];
}
export async function recordMedication(record: MedicationRecord): Promise<void> {
  const { error } = await getSupabaseClient().from('medication_records').upsert(record, { onConflict: 'medication_id,day' });
  if (error) throw new Error('복약 기록을 저장하지 못했습니다.');
}
export async function listCareLinks(): Promise<CareLink[]> {
  const { data, error } = await getSupabaseClient().from('care_links').select('id,patient_id,guardian_id,status');
  if (error) throw new Error('연결 정보를 불러오지 못했습니다.');
  return data as CareLink[];
}
export async function requestCareLink(patientId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('request_care_link', { target_patient: patientId });
  if (error) throw new Error('연결 요청을 처리하지 못했습니다.');
  return data as string;
}
export async function respondToCareLink(id: string, action: 'approve' | 'revoke'): Promise<void> {
  const { error } = await getSupabaseClient().rpc(action === 'approve' ? 'approve_care_link' : 'revoke_care_link', { link_id: id });
  if (error) throw new Error('연결 승인을 처리하지 못했습니다.');
}
