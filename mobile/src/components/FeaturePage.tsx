import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getCurrentUser, type AuthUser } from '../services/auth';
import { getSupabaseClient } from '../services/supabase';
import { Action, Chip, StatusMessage, s } from './ui';

// Reuse the existing ordinary-user session and verified server profile.
// This wrapper neither grants roles nor changes the index authentication flow.
export function FeaturePage({ title, subtitle, patientOnly = false, children }: {
  title: string; subtitle: string; patientOnly?: boolean; children: (user: AuthUser) => ReactNode;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<AuthUser | null>(null), [loading, setLoading] = useState(true);
  const verifiedId = useRef<string | null>(null);
  useEffect(() => {
    let active = true, revision = 0, timer: ReturnType<typeof setTimeout> | undefined;
    async function verify() {
      const epoch = ++revision; setUser(null); setLoading(true);
      try { const value = await getCurrentUser(); if (active && epoch === revision) { verifiedId.current = value.id; setUser(value); } }
      catch { if (active && epoch === revision) { verifiedId.current = null; setUser(null); } }
      finally { if (active && epoch === revision) setLoading(false); }
    }
    void verify();
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
        if (!active) return;
        // Successful password changes/refreshes for the same verified user must
        // not unmount the form and erase its result. Account switches still lock.
        if (session?.user.id === verifiedId.current && (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) return;
        verifiedId.current = null;
        revision++; setUser(null); setLoading(true); clearTimeout(timer);
        timer = setTimeout(() => { if (active) void verify(); }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { /* The normal verification above provides the login fallback. */ }
    return () => { active = false; revision++; clearTimeout(timer); unsubscribe?.(); };
  }, []);
  return <SafeAreaView style={s.root} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView style={s.flex} contentContainerStyle={[s.page, width < 380 && s.compactPage]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={s.backText}>‹ 돌아가기</Text></Pressable>
        <Text accessibilityRole="header" style={s.h1}>{title}</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 16 }]}>{subtitle}</Text>
        {loading ? <StatusMessage kind="loading">로그인 상태를 확인하고 있습니다.</StatusMessage> : !user ? <>
          <StatusMessage>로그인한 계정에서 이용할 수 있는 화면입니다. 로그인 상태를 다시 확인해 주세요.</StatusMessage>
          <Action label="홈에서 로그인 상태 확인" onPress={() => router.replace('/')} />
        </> : <>
          <Chip text={user.role === 'patient' ? '환자 계정' : '보호자 계정'} kind={user.role === 'patient' ? 'blue' : 'green'} />
          {patientOnly && user.role !== 'patient' ? <StatusMessage>환자 본인의 처방전과 설정을 관리하는 화면입니다. 보호자는 승인된 범위의 가족 정보만 조회할 수 있습니다.</StatusMessage> : children(user)}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
