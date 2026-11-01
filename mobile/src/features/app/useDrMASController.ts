import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Role, Route, Tab, Medication, Chat } from './types';
const seedMeds: Medication[] = [
  { id: '1', title: '아침 복약', detail: '예시 일정 · 식후', time: '08:00', taken: false },
  { id: '2', title: '점심 복약', detail: '예시 일정 · 식후', time: '13:00', taken: false },
  { id: '3', title: '저녁 복약', detail: '예시 일정 · 식후', time: '19:00', taken: false },
];
function todayKey(): string {
  const now = new Date();
  // Use the device's calendar day, not UTC, for daily medication status.
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const storageKey = (day: string) => `drmas.medication.v1.${day}`;

export function useDrMASController() {
  const [route, setRoute] = useState<Route>('welcome');
  const [role, setRole] = useState<Role>('patient');
  const [tab, setTab] = useState<Tab>('home');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [meds, setMeds] = useState<Medication[]>(seedMeds);
  const [medsReady, setMedsReady] = useState(false);
  const [medsError, setMedsError] = useState<string | null>(null);
  const [medsDay, setMedsDay] = useState(todayKey);
  useEffect(() => {
    let active = true;
    async function loadDay() {
      setMedsReady(false);
      setMedsError(null);
      try {
        const raw = await AsyncStorage.getItem(storageKey(medsDay));
        if (!active) return;
        const checked: unknown = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(checked) || !checked.every(v => typeof v === 'string')) {
          throw new Error('Invalid medication data');
        }
        const checkedIds = new Set(checked);
        setMeds(seedMeds.map(m => ({ ...m, taken: checkedIds.has(m.id) })));
      } catch {
        if (active) {
          setMeds(seedMeds);
          setMedsError('복약 기록을 불러오지 못했습니다.');
        }
      } finally { if (active) setMedsReady(true); }
    }
    void loadDay();
    return () => { active = false; };
  }, [medsDay]);

  useEffect(() => {
    if (!medsReady) return;
    const ids = meds.filter(m => m.taken).map(m => m.id);
    AsyncStorage.setItem(storageKey(medsDay), JSON.stringify(ids))
      .then(() => setMedsError(null))
      .catch(() => setMedsError('복약 기록을 저장하지 못했습니다.'));
  }, [meds, medsDay, medsReady]);

  // Re-check the local day when the user returns to the app.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        const day = todayKey();
        setMedsDay(previous => previous === day ? previous : day);
      }
    });
    return () => listener.remove();
  }, []);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Chat[]>([
    { id: 1, sender: 'assistant', text: '안녕하세요. Dr.MAS 건강 상담입니다. 현재 AI 상담 서비스 연결을 준비하고 있습니다.' },
  ]);
  const [sosLeft, setSosLeft] = useState<number | null>(null);
  const [sosNotice, setSosNotice] = useState(false);
  const [sosAcknowledged, setSosAcknowledged] = useState(false);
  const [sosDelay, setSosDelay] = useState(10);
  const messageCounter = useRef(2);
  const roleLabel = role === 'patient' ? '환자' : '보호자';
  const takenCount = meds.filter(m => m.taken).length;

  useEffect(() => {
    if (sosLeft === null) return;
    if (sosLeft === 0) {
      setSosLeft(null);
      setSosNotice(true);
      setSosAcknowledged(false);
      return;
    }
    const timer = setTimeout(() => setSosLeft(v => v === null ? null : Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [sosLeft]);

  function selectRole(next: Role) {
    setRole(next);
    setRoute('login');
    setTab('home');
    setPassword('');
    setConfirm('');
  }
  function submitAuth() {
    if (route === 'register' && !name.trim()) { Alert.alert('입력 확인', '이름을 입력해 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { Alert.alert('입력 확인', '올바른 이메일을 입력해 주세요.'); return; }
    if (password.length < 8) { Alert.alert('입력 확인', '비밀번호는 8자 이상 입력해 주세요.'); return; }
    if (route === 'register' && password !== confirm) { Alert.alert('입력 확인', '비밀번호가 일치하지 않습니다.'); return; }
    Alert.alert('인증 서버 연결 전', '입력 형식은 확인했지만 실제 계정 인증이나 생성은 아직 지원하지 않습니다. 현재 이용 가능한 화면으로 이동할 수 있습니다.');
  }
  function preview() {
    setPassword(''); setConfirm(''); setRoute('dashboard'); setTab('home');
  }
  function signOut() { setRoute('welcome'); setPassword(''); setConfirm(''); setTab('home'); }
  function toggleMedication(id: string) {
    if (!medsReady) return;
    const day = todayKey();
    if (day !== medsDay) { setMedsDay(day); return; }
    setMeds(old => old.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
  }
  function sendChat() {
    const text = chatInput.trim(); if (!text) return;
    setMessages(old => [...old, { id: messageCounter.current++, sender: 'user', text },
      { id: messageCounter.current++, sender: 'assistant', text: '지금은 AI API가 연결되지 않았습니다. 실제 건강 상담 기능을 연결하기 전까지 의료적 판단을 제공하지 않습니다. 응급 증상이 있다면 즉시 119에 연락하세요.' }]);
    setChatInput('');
  }
  function startSOS() {
    setSosNotice(false); setSosAcknowledged(false); setSosLeft(sosDelay);
  }

  return {
    route, setRoute, role, setRole, tab, setTab, name, setName, email, setEmail,
    password, setPassword, confirm, setConfirm, showPassword, setShowPassword,
    meds, medsReady, medsError, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice,
    sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay,
    roleLabel, takenCount, selectRole, submitAuth, preview, signOut,
    toggleMedication, sendChat, startSOS,
  };
}
export type DrMASController = ReturnType<typeof useDrMASController>;
