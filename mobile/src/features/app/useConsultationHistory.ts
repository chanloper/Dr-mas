import { useCallback, useState, type SetStateAction } from 'react';
import { beginConsultation, emptyConsultations, removeConsultation, visibleConsultations, type ConsultationRecord } from '../../services/consultationHistory';
export function useConsultationHistory(owner: string | null) {
 const [stored, setStored] = useState(() => emptyConsultations(owner));
 const state = visibleConsultations(stored, owner);
 if (stored.owner !== owner) setStored(state);
 const current = state.records.find(record => record.id === state.active)!;
 const reset = useCallback(() => setStored(emptyConsultations(null)), []);
 function update<K extends keyof ConsultationRecord>(key: K, value: SetStateAction<ConsultationRecord[K]>) {
  const id = current.id, expectedOwner = owner;
  setStored(previous => {
   if (previous.owner !== expectedOwner || previous.generation !== state.generation) return previous;
   const safe = visibleConsultations(previous, expectedOwner);
   if (safe.active !== id) return previous;
   const record = safe.records.find(item => item.id === id)!;
   const next = typeof value === 'function' ? (value as (old: ConsultationRecord[K]) => ConsultationRecord[K])(record[key]) : value;
   if (JSON.stringify(next) === JSON.stringify(record[key])) return previous;
   return { ...safe, records: safe.records.map(record => {
    if (record.id !== id) return record;
    return { ...record, [key]: next };
   }) };
  });
 }
 function start() { setStored(previous => previous.owner === owner && previous.generation === state.generation ? beginConsultation(previous) : previous); }
 function open(id: number) {
  setStored(previous => {
   if (previous.owner !== owner || previous.generation !== state.generation) return previous;
   const safe = visibleConsultations(previous, owner);
   if (!safe.records.some(record => record.id === id && record.consent)) return safe;
   return { ...safe, active: id, records: safe.records.filter(record => record.id === id || record.consent).map(record => record.id === id ? { ...record, reopened: true } : record) };
  });
 }
 function remove(id?: number) { setStored(previous => previous.owner === owner && previous.generation === state.generation ? removeConsultation(previous, id) : previous); }
 return { current, records: state.records.filter(record => record.consent), update, reset, start, open, remove };
}
