import { careNameLabel } from '../services/careNames';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FeaturePage } from '../components/FeaturePage';
import { FeatureModal } from '../components/FeatureModal';
import { Action, Field, Panel, StatusMessage, TitleRow, s } from '../components/ui';
import type { AuthUser } from '../services/auth';
import { createAccountRepository, AccountError, accountErrorMessage } from '../services/account';
import { getSupabaseClient } from '../services/supabase';
import { useCareLinks } from '../features/care/useCareLinks';

function AccountConnections({ user }: { user: AuthUser }) {
  const router = useRouter();
  const links = useCareLinks({ id: user.id, role: user.role });
  const approved = links.rows.filter(row => row.status === 'approved');
  return <View style={{ marginVertical: 12, gap: 8 }}>
    {links.busy && <StatusMessage kind="loading">현재 연결 상태를 확인하고 있습니다.</StatusMessage>}
    {links.error && <StatusMessage kind="error">{links.error}</StatusMessage>}
    {links.ready && <>
      <Text style={s.bodyStrong}>불러온 승인 연결: {approved.length}건</Text>
      {!approved.length && <Text style={s.caption}>이 목록에 승인된 연결이 없습니다.</Text>}
      {approved.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel="가족 연결 관리 열기" onPress={() => router.replace({ pathname: '/', params: { section: 'settings' } })} style={s.listItem}><Text style={s.paragraph}>{careNameLabel(row)} · 관계: {user.role === 'patient' ? '보호자' : '환자'}</Text><Text style={s.caption}>승인됨 · {row.approved_at ? new Date(row.approved_at).toLocaleDateString() : '승인일 확인 필요'}</Text><Text style={s.caption}>승인된 연결에서만 등록된 이름을 확인할 수 있어요. 선택하면 연결 관리로 이동합니다.</Text></Pressable>)}
    </>}
    {links.hasMore && <><Text style={s.caption}>아직 불러오지 않은 연결·이력이 있습니다.</Text><Action label="연결 더 불러오기" outline small disabled={links.busy || !links.ready} onPress={() => { void links.loadMore(); }} /></>}
    <Action label="연결 상태 새로고침" outline small disabled={links.busy} onPress={() => { void links.refresh(); }} />
  </View>;
}

function AccountDetails({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [profile, setProfile] = useState(user), [name, setName] = useState(user.name), [ready, setReady] = useState(true);
  const [dialog, setDialog] = useState<'password' | 'withdrawal' | null>(null), [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | 'code' | 'reload' | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [currentPassword, setCurrentPassword] = useState(''), [nonce, setNonce] = useState('');
  const [needsCode, setNeedsCode] = useState(false), [cooldown, setCooldown] = useState(false);
  const active = useRef(true), lock = useRef(false), repository = useRef<ReturnType<typeof createAccountRepository> | null>(null);
  function repo() { return repository.current ??= createAccountRepository(getSupabaseClient()); }
  function clearSecrets() { setPassword(''); setConfirmation(''); setCurrentPassword(''); setNonce(''); }
  useEffect(() => {
    active.current = true;
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') clearSecrets(); });
    return () => { active.current = false; listener.remove(); };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(false), 60000); return () => clearTimeout(timer); }, [cooldown]);
  async function perform(operation: NonNullable<typeof busy>) {
    if (lock.current || !active.current) return;
    lock.current = true; setBusy(operation); setError(null); setNotice(null);
    try {
      if (operation === 'profile' || operation === 'reload') {
        const next = operation === 'profile' ? await repo().updateName(user.id, name) : await repo().read(user.id);
        if (!active.current) return;
        setProfile(next); setName(next.name); setReady(true);
        setNotice(operation === 'profile' ? '이름을 저장했습니다. 계정 역할과 연결 정보는 변경하지 않았습니다.' : '현재 프로필을 다시 불러왔습니다.');
      } else if (operation === 'code') {
        await repo().requestCode(user.id);
        if (active.current) { setNeedsCode(true); setCooldown(true); setNotice('등록된 인증 연락처로 확인 코드를 요청했습니다. 받은 코드를 입력해 주세요.'); }
      } else {
        await repo().changePassword(user.id, { password, confirmation, currentPassword, nonce });
        if (active.current) { clearSecrets(); setNeedsCode(false); setNotice('비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.'); }
      }
    } catch (e) {
      if (!active.current) return;
      setError(accountErrorMessage(e));
      if (e instanceof AccountError && ['REAUTH_REQUIRED', 'CODE_INVALID'].includes(e.code)) setNeedsCode(true);
      if (e instanceof AccountError && e.code === 'RATE_LIMIT' && operation === 'code') setCooldown(true);
      if ((operation === 'profile' || operation === 'reload') && !(e instanceof AccountError && e.code === 'INPUT')) setReady(false);
      if (operation === 'password') { setPassword(''); setConfirmation(''); setCurrentPassword(''); if (!(e instanceof AccountError && e.code === 'REAUTH_REQUIRED')) setNonce(''); }
    } finally { lock.current = false; if (active.current) setBusy(null); }
  }
  function closeDialog() { if (lock.current) return; clearSecrets(); setDialog(null); }
  return <>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {notice && <StatusMessage>{notice}</StatusMessage>}
    <Panel style={{ marginTop: 16 }}>
      <TitleRow title="프로필" />
      <Field label="이름" value={name} onChangeText={setName} maxLength={100} autoComplete="name" editable={!busy && ready} />
      <Text style={s.caption}>로그인 이메일</Text><Text selectable style={[s.paragraph, { marginBottom: 12 }]}>{profile.email}</Text>
      <Text style={s.bodyStrong}>{profile.role === 'patient' ? '환자 계정' : '보호자 계정'}</Text>
      <Text style={[s.caption, { marginVertical: 12 }]}>이름만 수정할 수 있습니다. 이메일과 계정 역할은 이 화면에서 변경하지 않습니다.</Text>
      {!ready && <StatusMessage>현재 프로필을 다시 확인한 후 수정해 주세요. 이전 입력은 다시 불러오면 초기화됩니다.</StatusMessage>}
      <Action label={busy === 'profile' ? '저장 중…' : '프로필 저장'} disabled={!!busy || !ready || !name.trim() || name.trim() === profile.name} onPress={() => { void perform('profile'); }} />
      <View style={{ marginTop: 10 }}><Action label={busy === 'reload' ? '확인 중…' : '입력 취소·프로필 다시 불러오기'} outline disabled={!!busy} onPress={() => { void perform('reload'); }} /></View>
    </Panel>
    <Panel style={s.sectionGap}>
      <TitleRow title="연결·정보 접근 권한" />
      <Text style={s.paragraph}>{profile.role === 'patient' ? '내 복약 일정·기록을 관리하고 보호자의 연결 요청을 승인하거나 해제할 수 있습니다.' : '환자가 승인한 연결의 복약 정보와 SOS만 조회할 수 있습니다. 환자 프로필 직접 조회와 복약 정보 수정은 허용되지 않습니다.'}</Text>
      <AccountConnections key={`${profile.id}:${profile.role}`} user={profile} />
      <StatusMessage>연결 해제는 연결 관리에서 진행합니다. 종료된 이력은 유지됩니다. 건강 정보·위치 공유·원격 설정 권한은 별도이며 아직 연결되지 않았습니다.</StatusMessage>
      <Action label="기존 연결 관리 열기" outline onPress={() => router.replace({ pathname: '/', params: { section: 'settings' } })} />
    </Panel>
    <Panel style={s.sectionGap}>
      <TitleRow title="계정 보안" />
      <View style={{ gap: 12 }}><Action label="비밀번호 변경" outline disabled={!!busy} onPress={() => { clearSecrets(); setError(null); setNotice(null); setDialog('password'); }} /><Action label="회원 탈퇴 안내" danger outline disabled={!!busy} onPress={() => setDialog('withdrawal')} /></View>
    </Panel>
    <FeatureModal visible={dialog !== null} title={dialog === 'password' ? '비밀번호 변경' : '회원 탈퇴'} onClose={closeDialog} closeDisabled={!!busy}>
      <StatusMessage>{dialog === 'password' ? '현재 로그인 세션으로 변경합니다. 서버에서 재인증을 요구하면 확인 코드를 요청해 입력하세요. 비밀번호·코드는 화면을 닫거나 앱을 벗어나면 비워집니다.' : '계정 삭제는 실행하지 않습니다. 연결·복약·SOS 이력에 영향이 있어 별도 본인 확인과 데이터 보존·삭제 정책 검토가 필요합니다.'}</StatusMessage>
      {dialog === 'password' ? <>
        <Field label="계정 이메일" value={profile.email} editable={false} />
        <Field label="현재 비밀번호 (서버 정책에 따라 필요)" value={currentPassword} onChangeText={setCurrentPassword} editable={!busy} secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false} maxLength={128} />
        <Field label="새 비밀번호 (8자 이상)" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={128} />
        <Field label="새 비밀번호 확인" value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={128} />
        {needsCode && <><Action label={busy === 'code' ? '코드 요청 중…' : cooldown ? '재요청은 잠시 후 가능합니다' : '재인증 확인 코드 받기'} outline disabled={!!busy || cooldown} onPress={() => { void perform('code'); }} />
          <Field label="재인증 확인 코드" value={nonce} onChangeText={setNonce} editable={!busy} secureTextEntry autoComplete="one-time-code" autoCapitalize="none" autoCorrect={false} maxLength={64} /></>}
        {error && <StatusMessage kind="error">{error}</StatusMessage>}
        {notice && <StatusMessage>{notice}</StatusMessage>}
        <Action label={busy === 'password' ? '비밀번호 변경 중…' : '비밀번호 변경 저장'} disabled={!!busy || password.length < 8 || password !== confirmation || needsCode && !nonce.trim()} onPress={() => { void perform('password'); }} />
      </> : <><View style={s.rowBetween}><Text style={[s.paragraph, { flex: 1 }]}>현재 데이터가 삭제되지 않음을 확인했습니다.</Text><Switch value={understood} onValueChange={setUnderstood} accessibilityLabel="탈퇴 안내 확인" /></View><Action label="계정 삭제 · 별도 절차 필요" danger disabled onPress={() => {}} /></>}
    </FeatureModal>
  </>;
}
export default function AccountScreen() {
  return <FeaturePage title="계정·권한" subtitle="내 프로필과 계정 보안, 정보 공유 범위를 확인하세요.">{user => <AccountDetails key={user.id} user={user} />}</FeaturePage>;
}
