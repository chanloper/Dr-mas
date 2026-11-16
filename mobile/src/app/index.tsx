import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrMASProvider } from '../features/app/context';
import { useDrMASController } from '../features/app/useDrMASController';
import { Action, AppIcon, C, s } from '../components/ui';
import WelcomeScreen from '../screens/WelcomeScreen';
import AuthScreen from '../screens/AuthScreen';
import PatientHome from '../screens/PatientHome';
import GuardianHome from '../screens/GuardianHome';
import MedicationScreen from '../screens/MedicationScreen';
import AiScreen from '../screens/AiScreen';
import ServicesScreen from '../screens/ServicesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { DashboardNavigation } from '../components/DashboardNavigation';
import type { Tab } from '../features/app/types';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

// Shared controller owns authentication and in-app navigation.
export function generateMetadata() {
  return { title: 'Dr.MAS', description: '나의 복약 기록과 가족의 건강을 위한 일상 관리' };
}
export default function DrMAS() {
  const controller = useDrMASController();
  const [historyRequest, setHistoryRequest] = useState(0);
  const { width } = useWindowDimensions();
  const { route, role, tab, setTab, sosLeft, setSosLeft, user, authLoading, authInitialized } = controller;
  const { section } = useLocalSearchParams<{ section?: string }>();
  useEffect(() => {
    if (route === 'dashboard' && typeof section === 'string' && ['home', 'medication', 'ai', 'services', 'settings'].includes(section)) setTab(section as Tab);
  }, [route, section, setTab]);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sosLeft !== null) { setSosLeft(null); return true; }
      if (route === 'dashboard' && tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => listener.remove();
  }, [route, tab, setTab, sosLeft, setSosLeft]));
  const tabs: { key: Tab; icon: string; title: string }[] = [
    { key: 'home', icon: 'home', title: '홈' },
    { key: 'medication', icon: 'medication', title: '복약' },
    { key: 'ai', icon: 'assistant', title: '상담' },
  ];
  const isPatientHome = route === 'dashboard' && role === 'patient' && tab === 'home';
  return <DrMASProvider value={controller}><SafeAreaView style={s.root} edges={['top', 'bottom']}>
    {authLoading && !authInitialized ? <View style={[s.flex, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.blue} /><Text style={s.paragraph}>인증 정보를 확인하고 있습니다.</Text></View> : route === 'welcome' ? <WelcomeScreen /> : route !== 'dashboard' || !user ? <AuthScreen /> : <>
      <DashboardNavigation onHistory={() => { setTab('ai'); setHistoryRequest(value => value + 1); }} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      {tab === 'ai' ? <AiScreen key={`ai:${user.id}`} historyRequest={historyRequest} onHistoryHandled={() => setHistoryRequest(0)} /> : <ScrollView style={s.flex} key={`${tab}-${role}`} contentContainerStyle={isPatientHome ? [s.page, { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 }] : [s.page, width < 380 && s.compactPage]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        {tab === 'home' ? (role === 'patient' ? <PatientHome /> : <GuardianHome />) : tab === 'medication' ? <MedicationScreen /> : tab === 'services' ? <ServicesScreen onHistory={() => { setTab('ai'); setHistoryRequest(value => value + 1); }} /> : <SettingsScreen />}
        <View style={{ height: 25 }} />
      </ScrollView>}
      <View accessibilityRole="tablist" style={[s.bottomNav, isPatientHome && { minHeight: 80, paddingBottom: 8 }]}>{tabs.map(item => {
        const selected = item.key === tab;
        return <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected }} onPress={() => setTab(item.key)} style={({ pressed }) => [s.navItem, { backgroundColor: selected ? C.pale : pressed ? '#F1F5F9' : C.white }]}>
          <AppIcon name={item.icon} color={selected ? C.blue : C.subtle} /><Text style={[s.navLabel, { color: selected ? C.blue : C.subtle, fontWeight: selected ? '600' : '500' }]}>{item.title}</Text>
        </Pressable>;
      })}</View>
      </KeyboardAvoidingView>
    </>}
    {sosLeft !== null && <View style={s.overlay} accessibilityViewIsModal><ScrollView style={{ width: '100%', flexGrow: 0 }} contentContainerStyle={{ paddingVertical: 12 }}><View style={[s.sosDialog, { width: '100%', maxWidth: 480, alignSelf: 'center' }]}><Text style={{ fontSize: 47, textAlign: 'center', color: C.white }}>⚠</Text><Text style={s.sosTitle}>SOS 알림 준비</Text><Text style={s.sosNumber}>{sosLeft}</Text><Text style={s.sosBody}>카운트다운이 끝나면 이 기기에 알림 상태만 기록됩니다. 보호자에게 메시지를 보내거나 119에 신고하지 않습니다.</Text>
      <Action label="취소하기" onPress={() => setSosLeft(null)} outline /></View></ScrollView></View>}
  </SafeAreaView></DrMASProvider>;
}
