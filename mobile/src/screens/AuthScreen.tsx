import React, { useEffect, useRef } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Field, Panel, StatusMessage, s } from '../components/ui';

function PasswordToggle({ label, visible, disabled, onPress }: { label: string; visible: boolean; disabled: boolean; onPress: () => void }) {
  const title = `${label} ${visible ? '숨기기' : '보기'}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityHint={visible ? '입력 내용을 가립니다.' : '입력 내용을 화면에 표시합니다.'}
    accessibilityState={{ selected: visible, disabled }} disabled={disabled} onPress={onPress}
    style={{ alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', marginTop: -8, marginBottom: 6 }}>
    <Text style={s.link}>{title}</Text>
  </Pressable>;
}

export default function AuthScreen() {
  const { route, setRoute, role, roleLabel, name, setName, email, setEmail, password, setPassword, confirm, setConfirm,
    showPassword, setShowPassword, showConfirmPassword, setShowConfirmPassword, submitAuth, authLoading,
    authError, setAuthError, authNotice, setAuthNotice, signupProcessed, signOut } = useDrMAS();
  const emailInput = useRef<React.ComponentRef<typeof TextInput>>(null), passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null), confirmInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') { setShowPassword(false); setShowConfirmPassword(false); }
    });
    return () => listener.remove();
  }, [setShowPassword, setShowConfirmPassword]);
  const registering = route === 'register';
  function clearPasswords() { setPassword(''); setConfirm(''); setShowPassword(false); setShowConfirmPassword(false); }
  function submit() { if (authLoading) return; Keyboard.dismiss(); void submitAuth(); }
    return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentContainerStyle={[s.page, s.authPage, { flexGrow: 1, justifyContent: 'center', paddingBottom: 48 }]}>
        <Pressable accessibilityRole="button" disabled={authLoading} accessibilityState={{ disabled: authLoading }} onPress={() => { Keyboard.dismiss(); setRoute('welcome'); clearPasswords(); setAuthError(null); setAuthNotice(null); }} style={s.back}><Text style={s.backText}>‹  역할 선택으로 돌아가기</Text></Pressable>
        <Link href="/places" asChild><Pressable accessibilityRole="link" disabled={authLoading} onPress={() => { Keyboard.dismiss(); clearPasswords(); }} style={{ paddingVertical: 12 }}><Text style={s.link}>로그인 없이 병원 · 약국 찾기 →</Text></Pressable></Link>
        <View style={s.brandMark}><Text style={s.brandSymbol}>✚</Text></View>
        <Chip text={`${roleLabel} 전용 서비스`} kind={role === 'guardian' ? 'green' : 'blue'} />
        <Text style={[s.h1, { marginTop: 15 }]}>{route === 'login' ? '다시 만나서 반가워요' : 'Dr.MAS 시작하기'}</Text>
        <Text style={s.paragraph}>{route === 'login' ? '안전하고 편리한 건강 관리의 시작' : '건강을 연결하는 첫걸음에 함께해요'}</Text>
        <Panel style={{ marginTop: 25 }}>
          {registering && <Field label="이름" value={name} onChangeText={setName} placeholder="이름을 입력해 주세요" editable={!authLoading}
            autoComplete="name" autoCapitalize="words" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailInput.current?.focus()} />}
          <Field inputRef={emailInput} label="이메일" value={email} onChangeText={setEmail} placeholder="이메일 주소를 입력해 주세요" editable={!authLoading}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="email"
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
          <Field inputRef={passwordInput} label="비밀번호" value={password} onChangeText={setPassword} placeholder={registering ? '8자 이상 입력' : '비밀번호를 입력하세요'}
            editable={!authLoading} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} spellCheck={false}
            autoComplete={registering ? 'new-password' : 'current-password'} importantForAutofill="yes"
            returnKeyType={registering ? 'next' : 'done'} submitBehavior={registering ? 'submit' : 'blurAndSubmit'} onSubmitEditing={registering ? () => confirmInput.current?.focus() : submit} />
          <PasswordToggle label="비밀번호" visible={showPassword} disabled={authLoading} onPress={() => setShowPassword(value => !value)} />
          {registering && <>
            <Field inputRef={confirmInput} label="비밀번호 확인" value={confirm} onChangeText={setConfirm} placeholder="비밀번호를 다시 입력해 주세요"
              editable={!authLoading} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoCorrect={false} spellCheck={false}
              autoComplete="new-password" importantForAutofill="yes" returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={submit} />
            <PasswordToggle label="비밀번호 확인" visible={showConfirmPassword} disabled={authLoading} onPress={() => setShowConfirmPassword(value => !value)} />
          </>}
          {authNotice && <View style={[s.alertSoft, { marginBottom: 12 }]}><Text accessibilityLiveRegion="polite" style={s.alertSoftText}>{authNotice}</Text></View>}
          {authError && <StatusMessage kind="error">{authError}</StatusMessage>}
          {authLoading && <View style={[s.row, { gap: 8, marginBottom: 12 }]}><ActivityIndicator color={C.blue} /><Text accessibilityLiveRegion="polite" style={s.paragraph}>{registering ? '가입 요청을 처리하고 있습니다.' : '로그인 정보를 확인하고 있습니다.'}</Text></View>}
          <Action label={authLoading ? '처리 중…' : registering ? '회원가입' : '로그인'} onPress={submit} disabled={authLoading} />
          {signupProcessed ? <View style={{ gap: 8, marginTop: 14 }}>
            <Text style={s.caption}>이미 요청한 계정으로 로그인해 주세요. 다른 계정은 아래 버튼으로 전환할 수 있습니다.</Text>
            <Action label="다른 계정 사용" onPress={signOut} outline small disabled={authLoading} />
          </View> : role === 'guardian' && !registering ? <StatusMessage>보호자는 승인된 보호자 계정으로 로그인해 주세요. 보호자 계정의 신규 발급이나 역할 변경은 관리자에게 문의해 주세요.</StatusMessage> : <Pressable accessibilityRole="button" disabled={authLoading} accessibilityState={{ disabled: authLoading }} onPress={() => { setAuthError(null); setAuthNotice(null); setRoute(registering ? 'login' : 'register'); clearPasswords(); }} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={s.link}>{route === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}</Text>
          </Pressable>}
        </Panel>
        {authError?.includes('삭제') && <Action label="로그아웃 다시 시도" onPress={signOut} outline disabled={authLoading} />}
      </ScrollView>
    </KeyboardAvoidingView>;
  }
