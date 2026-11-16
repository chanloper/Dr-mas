import type { Chat } from '../features/app/types';
import type { ConsultationAnswer } from './consultationFlow';
import type { emergencyGuidance } from './emergencyGuidance';
export type EmergencyRecord = ReturnType<typeof emergencyGuidance> & { reported: string; context: string };
export type InterviewSnapshot = { checked: boolean; answers: ConsultationAnswer[]; turns: { question?: string; text: string; freeText?: boolean }[]; urgent: boolean; riskAnswer?: string; checkAnswer?: string; riskText?: string; searchRequested?: boolean };
export type ConsultationRecord = {
 id: number; createdAt: string; consent: boolean; reopened: boolean;
 messages: Chat[]; draft: string; emergency: EmergencyRecord | null;
 interviews: { question: string; anchor: number; followup?: boolean }[];
 snapshots: Record<string, InterviewSnapshot>;
};
export type ConsultationHistory = { owner: string | null; generation: number; active: number; records: ConsultationRecord[] };
let generation = 0;
export function newConsultation(id: number): ConsultationRecord {
 return { id, createdAt: new Date().toISOString(), consent: false, reopened: false, messages: [], draft: '', emergency: null, interviews: [], snapshots: {} };
}
export function emptyConsultations(owner: string | null): ConsultationHistory {
 return { owner, generation: ++generation, active: 1, records: [newConsultation(1)] };
}
// Memory only. No storage SDK, filesystem, network, token or console access.
// A different owner never receives even one render of the previous owner's data.
export function visibleConsultations(state: ConsultationHistory, owner: string | null): ConsultationHistory {
 return state.owner === owner ? state : emptyConsultations(owner);
}
export function beginConsultation(state: ConsultationHistory): ConsultationHistory {
 const id = Math.max(state.active, ...state.records.map(record => record.id)) + 1;
 return { ...state, active: id, records: [...state.records.filter(record => record.consent), newConsultation(id)] };
}
export function removeConsultation(state: ConsultationHistory, id?: number): ConsultationHistory {
 if (id === undefined) { const next = newConsultation(Math.max(state.active, ...state.records.map(record => record.id)) + 1); return { ...state, active: next.id, records: [next] }; }
 const records = state.records.filter(record => record.id !== id);
 if (id !== state.active) return { ...state, records };
 const next = newConsultation(Math.max(state.active, ...records.map(record => record.id)) + 1);
 return { ...state, active: next.id, records: [...records, next] };
}
