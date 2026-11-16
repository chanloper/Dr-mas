import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, C, s } from './ui';

export function FeatureModal({ visible, title, onClose, children, closeDisabled = false, fullHeight = false, scrollContent = true }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; closeDisabled?: boolean; fullHeight?: boolean; scrollContent?: boolean }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 360 || height < 600;
  const space = compact ? 12 : 16;
  const availableHeight = Math.max(180, height - Math.max(space, insets.top) - Math.max(space, insets.bottom));
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!closeDisabled) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(20,36,61,.62)', justifyContent: 'center', paddingTop: Math.max(space, insets.top), paddingBottom: Math.max(space, insets.bottom), paddingLeft: Math.max(space, insets.left), paddingRight: Math.max(space, insets.right) }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 600, height: fullHeight ? Math.min(760, availableHeight) : undefined, maxHeight: availableHeight, minHeight: 0, flexShrink: 1, alignSelf: 'center', backgroundColor: C.white, borderRadius: 24, overflow: 'hidden' }}>
        <View style={{ flexShrink: 0, padding: compact ? 14 : 20, backgroundColor: C.pale }}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text></View>
        {scrollContent ? <ScrollView style={{ flexGrow: fullHeight ? 1 : 0, flexBasis: fullHeight ? 0 : 'auto', flexShrink: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: compact ? 16 : 20, gap: 16 }}>
          {children}
        </ScrollView> : <View style={{ flex: 1, minHeight: 0 }}>{children}</View>}
        <View style={{ flexShrink: 0, padding: space, backgroundColor: C.white }}><Action label={closeDisabled ? '처리 중 · 잠시 기다려 주세요' : '닫기'} disabled={closeDisabled} outline onPress={onClose} /></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
