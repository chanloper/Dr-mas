export type Role = 'patient' | 'guardian';
export type Route = 'welcome' | 'login' | 'register' | 'dashboard';
export type Tab = 'home' | 'medication' | 'ai' | 'services' | 'settings';
export type Medication = { id: string; title: string; detail: string; time: string; taken: boolean };
export type Chat = { id: number; sender: 'user' | 'assistant'; text: string };
