import React from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { AppIcon, C, Chip, s } from '../components/ui';

export default function WelcomeScreen() {
  const { selectRole } = useDrMAS();
  return <ScrollView contentContainerStyle={[s.page, s.authPage, { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 }]}>
    <View style={{ alignItems: 'center', marginBottom: 24,backgroundColor:C.blue,borderRadius:32,padding:32 }}>
      <View style={[s.heroLogo, { marginBottom: 18,width:80,height:80,backgroundColor:C.white,borderRadius:24 }]}><AppIcon name="health" color={C.blue} size={42} /></View>
      <Text style={[s.appName, { textAlign: 'center',color:C.white }]}>Dr.MAS</Text>
      <Text style={{ color: C.sage, fontSize: 17, lineHeight: 28, fontWeight: '600', textAlign: 'center', marginTop: 6, maxWidth: '100%' }}>가족과 나를 위한 건강 동반자</Text>
      <Text style={[s.paragraph, { color:C.white,textAlign: 'center', marginTop: 20 }]}>나의 건강과 가족의 안심을{ '\n' }하나로 연결하는 일상 케어</Text>
    </View>
    <View style={[s.welcomePanel, { backgroundColor: 'transparent', padding: 0, marginTop: 0 }]}>
      <View style={s.rowBetween}><Text style={s.welcomeQuestion}>어떤 역할로 시작할까요?</Text><Chip text="계정 선택" kind="neutral" /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="환자로 시작하기" onPress={() => selectRole('patient')} style={({ pressed }) => [s.roleCard, { borderColor: C.line, backgroundColor: C.white, paddingVertical: 16, opacity: pressed ? .75 : 1 }]}>
        <View style={[s.roleIcon, { backgroundColor: C.container }]}><AppIcon name="health" color={C.blue} size={28} /></View>
        <View style={s.flex}><Text style={s.roleTitle}>환자로 시작하기</Text><Text style={s.caption}>나의 건강 · 복약 · AI 상담</Text></View><Text style={s.chevron}>›</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="보호자로 시작하기" onPress={() => selectRole('guardian')} style={({ pressed }) => [s.roleCard, { borderColor: C.line, backgroundColor: C.white, paddingVertical: 16, marginBottom: 0, opacity: pressed ? .75 : 1 }]}>
        <View style={[s.roleIcon, { backgroundColor: C.sage }]}><AppIcon name="family" color={C.green} size={28} /></View>
        <View style={s.flex}><Text style={s.roleTitle}>보호자로 시작하기</Text><Text style={s.caption}>가족 연결 · 모니터링 · SOS</Text></View><Text style={s.chevron}>›</Text>
      </Pressable>
    </View>
    <Link href="/places" asChild><Pressable accessibilityRole="link" style={StyleSheet.flatten([s.action, { backgroundColor: C.blue, marginTop: 18 }])}><Text style={[s.actionText, { color: C.white }]}>로그인 없이 병원 · 약국 찾기</Text></Pressable></Link>
    <View style={{ marginTop: 22, padding: 15, backgroundColor: C.pale, borderRadius: 13 }}><Text style={[s.caption, { textAlign: 'center', lineHeight: 20 }]}>의료진의 진단과 응급 구조 서비스를 대체하지 않습니다.{ '\n' }SOS는 보호자 확인용이며 119 자동 신고가 아닙니다.</Text></View>
  </ScrollView>;
}
