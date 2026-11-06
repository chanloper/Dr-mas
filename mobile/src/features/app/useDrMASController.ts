import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { localMedications, LocalMedicationError } from '../../services/localMedications';
import type { Role, Route, Tab, Medication, Chat } from './types';
import * as auth from '../../services/auth';
import { sendRagChat, ragErrorMessage } from '../../services/rag';
import type { RagReply } from '../../services/ragClient';
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
const initialMessages = (): Chat[] => [
  { id: 1, sender: 'assistant', text: '안녕하세요. 일반 건강정보 자료를 검색합니다. 개인정보나 진료·복약 기록은 입력하지 마세요.' },
];

export function useDrMASController() {
  const [route, setRoute] = useState<Route>('welcome');
  const [role, setRole] = useState<Role>('patient');
  const [tab, setTab] = useState<Tab>('home');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [user, setUser] = useState<auth.AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [signupProcessed, setSignupProcessed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authBusy = useRef(true);
  const sessionEpoch = useRef(0);
  const owner = useRef<string | null>(null);
  const chatRequest = useRef<{ controller: AbortController; epoch: number; userId: string } | null>(null);
  const [chatLoading, setChatLoading] = useState(false), [chatNotice, setChatNotice] = useState<string | null>(null);
  const record = useRef<{ userId: string; day: string; ids: string[]; epoch: number; busy: boolean } | null>(null);
  const loadEpoch = useRef(0);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [medsReady, setMedsReady] = useState(false);
  const [medsError, setMedsError] = useState<string | null>(null);
  const [medsSaving, setMedsSaving] = useState(false);
  const [medsReload, setMedsReload] = useState(0);
  const [medsDay, setMedsDay] = useState(todayKey);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Chat[]>(initialMessages);
  const [sosLeft, setSosLeft] = useState<number | null>(null);
  const [sosNotice, setSosNotice] = useState(false);
  const [sosAcknowledged, setSosAcknowledged] = useState(false);
  const [sosDelay, setSosDelay] = useState(10);
  const messageCounter = useRef(2);
  const dayScope = useRef(medsDay);
  const switchDay = useCallback((day: string) => {
    if (dayScope.current === day) return;
    dayScope.current = day; loadEpoch.current++; record.current = null;
    setMeds([]); setMedsReady(false); setMedsSaving(false); setMedsError(null); setMedsDay(day);
  }, []);
  const invalidateSession = useCallback(() => {
    chatRequest.current?.controller.abort(); chatRequest.current = null;
    sessionEpoch.current++; loadEpoch.current++; record.current = null; owner.current = null;
  }, []);
  const resetPrivateState = useCallback(() => {
    invalidateSession();
    setMeds([]); setMedsReady(false); setMedsError(null); setMedsSaving(false);
    setMedsReload(value => value + 1);
    setChatInput(''); setMessages(initialMessages()); messageCounter.current = 2;
    setChatLoading(false); setChatNotice(null);
    setSosLeft(null); setSosNotice(false); setSosAcknowledged(false); setSosDelay(10);
    setPassword(''); setConfirm(''); setShowPassword(false); setName(''); setEmail(''); setTab('home'); setRole('patient');
    setShowConfirmPassword(false); setAuthNotice(null); setSignupProcessed(false);
  }, [invalidateSession]);
  const acceptUser = useCallback((account: auth.AuthUser) => {
    resetPrivateState(); owner.current = account.id; switchDay(todayKey());
    setUser(account); setRole(account.role); setName(account.name); setEmail(account.email);
    setPassword(''); setConfirm(''); setTab('home'); setRoute('dashboard');
  }, [resetPrivateState, switchDay]);
  useEffect(() => {
    let active = true;
    const epoch = sessionEpoch.current;
    async function restore() {
      try {
        const token = await auth.readToken();
        if (!active || epoch !== sessionEpoch.current || !token) return;
        const account = await auth.getCurrentUser(token);
        if (active && epoch === sessionEpoch.current) acceptUser(account);
      } catch (error) {
        if (!active || epoch !== sessionEpoch.current) return;
        if (error instanceof auth.AuthError && ['PROFILE', 'PROFILE_SCHEMA', 'PROFILE_PERMISSION'].includes(error.code)) {
          setSignupProcessed(true);
          setAuthNotice('계정 인증은 확인했지만 서비스 이용 정보를 불러오지 못했습니다. 다시 가입할 필요는 없습니다.');
        }
        if (active) setRoute('login');
        if (error instanceof auth.AuthError && error.code === 'UNAUTHORIZED') {
          try { await auth.clearToken(); } catch { if (active) setAuthError('저장된 로그인 정보를 삭제하지 못했습니다. 다시 시도해 주세요.'); return; }
        }
        if (active) { setAuthError(auth.authErrorMessage(error)); setRoute('login'); }
      } finally { if (active) { authBusy.current = false; setAuthLoading(false); setAuthInitialized(true); } }
    }
    let stop = () => {};
    try {
      stop = auth.watchSession(() => {
        if (active) { resetPrivateState(); setUser(null); setRoute('login'); setAuthError(null); }
      });
    } catch { /* restore reports configuration/storage errors through the auth UI. */ }
    void restore();
    return () => { active = false; invalidateSession(); stop(); };
  }, [acceptUser, resetPrivateState, invalidateSession]);
  useEffect(() => {
    let active = true;
    const epoch = ++loadEpoch.current;
    const userId = user?.id;
    record.current = null;
    if (!userId || owner.current !== userId) return;
    async function loadDay() {
      try {
        const ids = await localMedications.read(userId!, medsDay);
        if (!active || loadEpoch.current !== epoch || owner.current !== userId) return;
        record.current = { userId: userId!, day: medsDay, ids, epoch, busy: false };
        const checkedIds = new Set(ids);
        setMeds(seedMeds.map(m => ({ ...m, taken: checkedIds.has(m.id) })));
        setMedsReady(true);
      } catch (error) {
        if (active && loadEpoch.current === epoch && owner.current === userId) {
          setMedsError(error instanceof LocalMedicationError ? error.message : '복약 기록을 확인하지 못했습니다.');
        }
      }
    }
    void loadDay();
    return () => { active = false; };
  }, [user?.id, medsDay, medsReload]);

  // Re-check the local day when the user returns to the app.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        switchDay(todayKey());
      }
    });
    return () => listener.remove();
  }, [switchDay]);
  const roleLabel = role === 'patient' ? '환자' : '보호자';
  const takenCount = meds.filter(m => m.taken).length;

  useEffect(() => {
    if (sosLeft === null) return;
    const epoch = sessionEpoch.current;
    const timer = setTimeout(() => {
      if (!owner.current || epoch !== sessionEpoch.current) return;
      if (sosLeft <= 1) {
        setSosLeft(null);
        setSosNotice(true);
        setSosAcknowledged(false);
      } else {
        setSosLeft(sosLeft - 1);
      }
    }, sosLeft === 0 ? 0 : 1000);
    return () => clearTimeout(timer);
  }, [sosLeft]);

  function selectRole(next: Role) {
    if (authBusy.current || user) return;
    setAuthError(null);
    if (!signupProcessed) setAuthNotice(null);
    setShowPassword(false); setShowConfirmPassword(false);
    setRole(next);
    setRoute('login');
    setTab('home');
    setPassword('');
    setConfirm('');
  }
  async function submitAuth() {
    if (authBusy.current) return;
    if (route === 'register' && signupProcessed) { setRoute('login'); return; }
    setAuthError(null);
    if (route === 'register' && !name.trim()) { Alert.alert('입력 확인', '이름을 입력해 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { Alert.alert('입력 확인', '올바른 이메일을 입력해 주세요.'); return; }
    if (!password.length) { Alert.alert('입력 확인', '비밀번호를 입력해 주세요.'); return; }
    if (route === 'register' && password.length < 8) { Alert.alert('입력 확인', '비밀번호는 8자 이상 입력해 주세요.'); return; }
    if (route === 'register' && password !== confirm) { Alert.alert('입력 확인', '비밀번호가 일치하지 않습니다.'); return; }
    authBusy.current = true; setAuthLoading(true);
    setShowPassword(false); setShowConfirmPassword(false);
    const epoch = sessionEpoch.current;
    const registering = route === 'register';
    let signupAccepted = false;
    try {
      const input = { email: email.trim(), password };
      const result = route === 'register'
        ? await auth.register({ ...input, name: name.trim(), requestedRole: role })
        : await auth.login(input);
      if (epoch !== sessionEpoch.current) return;
      signupAccepted = registering;
      if ('requiresEmailConfirmation' in result) {
        setRoute('login');
        setSignupProcessed(true); setPassword(''); setConfirm('');
        setAuthNotice('가입 요청을 처리했습니다. 이메일에 도착한 인증 안내를 확인한 후 로그인해 주세요. 이미 가입한 이메일이라면 기존 계정으로 로그인해 주세요.');
        return;
      }
      const account = await auth.getCurrentUser(result.accessToken);
      if (epoch !== sessionEpoch.current) return;
      await auth.saveToken(result.accessToken);
      if (epoch === sessionEpoch.current) acceptUser(account);
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      if (signupAccepted) {
        setSignupProcessed(true); setRoute('login'); setPassword(''); setConfirm('');
        setAuthNotice('가입 요청은 처리되었습니다. 계정 정보 확인을 마치지 못했습니다. 다시 가입하지 말고 아래 안내를 확인한 뒤 로그인해 주세요.');
      }
      setAuthError(auth.authErrorMessage(error));
    }
    finally { authBusy.current = false; setAuthLoading(false); }
  }
  async function signOut() {
    if (authBusy.current) return;
    authBusy.current = true; setAuthLoading(true); setAuthError(null);
    // Lock the dashboard immediately, even if secure storage deletion fails.
    resetPrivateState(); setUser(null); setRoute('login');
    try { await auth.clearToken(); setRoute('welcome'); }
    catch (error) { setAuthError(auth.authErrorMessage(error)); }
    finally { authBusy.current = false; setAuthLoading(false); }
  }
  async function toggleMedication(id: string) {
    const current = record.current;
    if (!current || current.busy || !medsReady || owner.current !== current.userId || !seedMeds.some(m => m.id === id)) return;
    const day = todayKey();
    if (day !== current.day) { switchDay(day); return; }
    const isCurrent = () => record.current === current && owner.current === current.userId && loadEpoch.current === current.epoch;
    current.busy = true; setMedsSaving(true); setMedsError(null);
    const ids = current.ids.includes(id) ? current.ids.filter(value => value !== id) : [...current.ids, id];
    try {
      const saved = await localMedications.write(current.userId, current.day, ids, isCurrent);
      if (!saved || !isCurrent()) return;
      current.ids = ids;
      setMeds(seedMeds.map(m => ({ ...m, taken: ids.includes(m.id) })));
    } catch (error) {
      if (isCurrent()) {
        // A failed native write may have an uncertain outcome. Require a read
        // before accepting another change rather than overwriting from memory.
        record.current = null; setMedsReady(false);
        setMedsError(error instanceof LocalMedicationError ? error.message : '복약 기록을 저장하지 못했습니다.');
      }
    } finally {
      if (owner.current === current.userId && loadEpoch.current === current.epoch) {
        current.busy = false; setMedsSaving(false);
      }
    }
  }
  function retryMedications() {
    if (!owner.current || record.current?.busy) return;
    switchDay(todayKey());
    loadEpoch.current++; record.current = null; setMeds([]); setMedsReady(false); setMedsError(null);
    setMedsReload(value => value + 1);
  }
  async function sendChat() {
    if (!owner.current || chatRequest.current) return;
    const text = chatInput.trim();
    if (!text || chatInput.length > 2000) { setChatNotice('질문은 1~2000자로 입력해 주세요.'); return; }
    const epoch = sessionEpoch.current;
    const userId = owner.current;
    const task = { controller: new AbortController(), epoch, userId };
    chatRequest.current = task; setChatLoading(true); setChatNotice(null);
    setMessages(old => [...old, { id: messageCounter.current++, sender: 'user', text }]);
    setChatInput('');
    try {
      const reply: RagReply | string = await sendRagChat(text, { signal: task.controller.signal });
      if (chatRequest.current === task && sessionEpoch.current === epoch && owner.current === userId) setMessages(old => [...old, {
        id: messageCounter.current++, sender: 'assistant', text: typeof reply === 'string' ? reply : reply.text,
        ...(typeof reply === 'string' ? {} : { sources: reply.sources, status: reply.status }), outcome: 'response',
      }]);
    } catch (error) {
      if (chatRequest.current === task && sessionEpoch.current === epoch && owner.current === userId) setMessages(old => [...old, { id: messageCounter.current++, sender: 'assistant', text: ragErrorMessage(error), outcome: 'error' }]);
    } finally { if (chatRequest.current === task) { chatRequest.current = null; setChatLoading(false); } }
  }
  const cancelChat = useCallback(() => {
    const task = chatRequest.current; if (!task) return;
    chatRequest.current = null; task.controller.abort();
    if (sessionEpoch.current !== task.epoch || owner.current !== task.userId) return;
    setChatLoading(false);
    setMessages(old => [...old, { id: messageCounter.current++, sender: 'assistant', text: '요청을 취소했습니다. 늦게 도착하는 결과는 표시하지 않습니다.', outcome: 'cancelled' }]);
  }, []);
  useEffect(() => { if (tab !== 'ai') cancelChat(); }, [tab, cancelChat]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancelChat(); });
    return () => listener.remove();
  }, [cancelChat]);
  function startSOS() {
    if (!owner.current) return;
    setSosNotice(false); setSosAcknowledged(false); setSosLeft(sosDelay);
  }

  return {
    user, authLoading, authInitialized, authError, setAuthError, authNotice, setAuthNotice, signupProcessed,
    route, setRoute, role, tab, setTab, name, setName, email, setEmail,
    password, setPassword, confirm, setConfirm, showPassword, setShowPassword,
    showConfirmPassword, setShowConfirmPassword,
    meds, medsReady, medsError, medsSaving, retryMedications, messages, chatInput, setChatInput, sosLeft, setSosLeft, sosNotice,
    sosAcknowledged, setSosAcknowledged, sosDelay, setSosDelay,
    roleLabel, takenCount, selectRole, submitAuth, signOut,
    toggleMedication, sendChat, cancelChat, chatLoading, chatNotice, startSOS,
  };
}
export type DrMASController = ReturnType<typeof useDrMASController>;
