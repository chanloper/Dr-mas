import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { C, Chip, s } from '../components/ui';

export default function WelcomeScreen() {
  const { selectRole } = useDrMAS();
  return <ScrollView contentContainerStyle={[s.page, { flexGrow: 1, justifyContent: 'center', paddingVertical: 38 }]}>
    <View style={{ alignItems: 'center', marginBottom: 24 }}>
      <View style={[s.heroLogo, { marginBottom: 18 }]}><Text style={s.heroHeart}>♥</Text><Text style={s.heroCross}>✚</Text></View>
      <Text style={[s.appName, { textAlign: 'center' }]}>Dr.MAS</Text>
      <Text style={{ color: C.green, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 6 }}>YOUR FAMILY HEALTH COMPANION</Text>
      <Text style={[s.paragraph, { textAlign: 'center', marginTop: 20, fontSize: 16, lineHeight: 26 }]}>나의 건강과 가족의 안심을{ '\n' }하나로 연결하는 일상 케어</Text>
    </View>
    <View style={[s.welcomePanel, { padding: 20, marginTop: 14 }]}>
      <View style={s.rowBetween}><Text style={s.welcomeQuestion}>어떤 역할로 시작할까요?</Text><Chip text="UI 체험" kind="neutral" /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="환자로 시작하기" onPress={() => selectRole('patient')} style={({ pressed }) => [s.roleCard, { borderColor: '#C7DEF9', backgroundColor: '#F7FBFF', paddingVertical: 16, opacity: pressed ? .75 : 1 }]}>
        <View style={[s.roleIcon, { backgroundColor: '#E1EEFF' }]}><Text style={[s.roleEmoji, { color: C.blue }]}>♡</Text></View>
        <View style={s.flex}><Text style={s.roleTitle}>환자로 시작하기</Text><Text style={s.caption}>나의 건강 · 복약 · AI 상담</Text></View><Text style={s.chevron}>›</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="보호자로 시작하기" onPress={() => selectRole('guardian')} style={({ pressed }) => [s.roleCard, { borderColor: '#C9EFE1', backgroundColor: '#F4FCF8', paddingVertical: 16, marginBottom: 0, opacity: pressed ? .75 : 1 }]}>
        <View style={[s.roleIcon, { backgroundColor: '#DDF8E9' }]}><Text style={[s.roleEmoji, { color: C.green }]}>♧</Text></View>
        <View style={s.flex}><Text style={s.roleTitle}>보호자로 시작하기</Text><Text style={s.caption}>가족 연결 · 모니터링 · SOS</Text></View><Text style={s.chevron}>›</Text>
      </Pressable>
    </View>
    <View style={{ marginTop: 22, padding: 15, backgroundColor: '#ECF3F9', borderRadius: 13 }}><Text style={[s.caption, { textAlign: 'center', lineHeight: 20 }]}>현재 화면은 기능 체험용 UI입니다.{ '\n' }실제 의료 진단, 긴급 신고, 가족 알림은 지원하지 않습니다.</Text></View>
  </ScrollView>;
}
