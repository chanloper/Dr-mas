import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrMASProvider } from '../features/app/context';
import { useDrMASController } from '../features/app/useDrMASController';
import { Action, C, Chip, s } from '../components/ui';
import WelcomeScreen from '../screens/WelcomeScreen';
import AuthScreen from '../screens/AuthScreen';
import PatientHome from '../screens/PatientHome';
import GuardianHome from '../screens/GuardianHome';
import MedicationScreen from '../screens/MedicationScreen';
import AiScreen from '../screens/AiScreen';
import ServicesScreen from '../screens/ServicesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { Tab } from '../features/app/types';

// All screens share one UI state in this stage. No server or medical services connected.
export default function DrMAS() {
  const controller = useDrMASController();
  const { route, role, roleLabel, tab, setTab, sosLeft, setSosLeft } = controller;
  const tabs: { key: Tab; icon: string; title: string }[] = [
    { key: 'home', icon: '⌂', title: '홈' },
    { key: 'medication', icon: '◷', title: '복약' },
    { key: 'ai', icon: '✦', title: 'AI 상담' },
    { key: 'services', icon: '▦', title: '서비스' },
    { key: 'settings', icon: '⚙', title: '설정' },
  ];
  return <DrMASProvider value={controller}><SafeAreaView style={s.root} edges={['top', 'bottom']}>
    {route === 'welcome' ? <WelcomeScreen /> : route !== 'dashboard' ? <AuthScreen /> : <>
      <View style={s.appHeader}><View style={s.row}><View style={s.smallBrand}><Text style={s.brandSymbol}>✚</Text></View><Text style={s.headerBrand}>Dr.MAS</Text></View><Chip text={`${roleLabel} · 기기 내 화면`} kind="neutral" /></View>
      <ScrollView key={`${tab}-${role}`} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {tab === 'home' ? (role === 'patient' ? <PatientHome /> : <GuardianHome />) : tab === 'medication' ? <MedicationScreen /> : tab === 'ai' ? <AiScreen /> : tab === 'services' ? <ServicesScreen /> : <SettingsScreen />}
        <View style={{ height: 25 }} />
      </ScrollView>
      <View style={s.bottomNav}>{tabs.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={s.navItem}>
        <Text style={[s.navIcon, { color: tab === item.key ? C.blue : C.subtle }]}>{item.icon}</Text><Text style={[s.navLabel, { color: tab === item.key ? C.blue : C.subtle, fontWeight: tab === item.key ? '800' : '500' }]}>{item.title}</Text>
      </Pressable>)}</View>
    </>}
    {sosLeft !== null && <View style={s.overlay}><View style={s.sosDialog}><Text style={{ fontSize: 47, textAlign: 'center', color: C.white }}>⚠</Text><Text style={s.sosTitle}>SOS 알림 준비</Text><Text style={s.sosNumber}>{sosLeft}</Text><Text style={s.sosBody}>카운트다운이 끝나면 이 기기에 알림 상태만 기록됩니다. 보호자에게 메시지를 보내거나 119에 신고하지 않습니다.</Text>
      <Action label="취소하기" onPress={() => setSosLeft(null)} outline /></View></View>}
  </SafeAreaView></DrMASProvider>;
}
