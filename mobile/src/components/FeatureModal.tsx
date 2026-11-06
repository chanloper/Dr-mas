import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, C, s } from './ui';

export function FeatureModal({ visible, title, onClose, children, closeDisabled = false }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; closeDisabled?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 360 || height < 600;
  const space = compact ? 12 : 16;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!closeDisabled) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(20,36,61,.62)', justifyContent: 'center', paddingTop: Math.max(space, insets.top), paddingBottom: Math.max(space, insets.bottom), paddingLeft: Math.max(space, insets.left), paddingRight: Math.max(space, insets.right) }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 600, maxHeight: '100%', minHeight: 0, flexShrink: 1, alignSelf: 'center', backgroundColor: C.white, borderRadius: 22, overflow: 'hidden' }}>
        <View style={{ padding: compact ? 14 : 20, borderBottomWidth: 1, borderColor: C.line }}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text></View>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: compact ? 16 : 20, gap: 14 }}>
          {children}
        </ScrollView>
        <View style={{ padding: space, borderTopWidth: 1, borderColor: C.line }}><Action label={closeDisabled ? '처리 중 · 닫기 대기' : '닫기'} disabled={closeDisabled} outline onPress={onClose} /></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
