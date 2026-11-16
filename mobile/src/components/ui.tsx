import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Medication } from '../features/app/types';
import { AppIcon } from './AppIcon';
import { designTokens as D } from './designTokens';
export { AppIcon } from './AppIcon';

export const C = {
  blue: D.colors.primary, blue2: D.colors.primaryContainer, green: D.colors.secondary, navy: D.colors.onSurface,
  ink: D.colors.onSurface, muted: D.colors.onSurfaceVariant, subtle: '#536177', bg: D.colors.surface,
  line: D.colors.outline, white: D.colors.white, danger: D.colors.error, pale: D.colors.surfaceLow,
  mint: D.colors.secondaryContainer, sage: D.colors.secondaryContainer, container: D.colors.surfaceContainer, lavender: D.colors.lavender,
  dark: D.colors.inverseSurface, onDark: D.colors.inverseOnSurface, dangerSoft: D.colors.errorContainer,
};
export function Chip({ text, kind = 'blue' }: { text: string; kind?: 'blue' | 'green' | 'red' | 'neutral' }) {
  const bg = { blue: C.container, green: C.sage, red: C.dangerSoft, neutral: C.pale }[kind];
  const color = { blue: C.blue, green: D.colors.onSecondaryContainer, red: C.danger, neutral: C.muted }[kind];
  return <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color }]}>{text}</Text></View>;
}
export function Action({ label, onPress, outline = false, danger = false, small = false, disabled = false, pressScale = false }: {
  label: string; onPress: () => void; outline?: boolean; danger?: boolean; small?: boolean; disabled?: boolean; pressScale?: boolean;
}) {
  const color = danger ? C.danger : C.blue;
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [s.action,
    { backgroundColor: outline ? C.pale : color, borderColor: outline && !danger ? C.container : color, paddingVertical: small ? 11 : 15, opacity: disabled ? .5 : pressed ? .78 : 1 }, pressed && pressScale && { transform: [{ scale: .98 }] }, focused && s.focused]}>
    <Text style={[s.actionText, { color: outline ? color : C.white, fontSize: D.typography.label }]}>{label}</Text>
  </Pressable>;
}
export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.panel, style]}>{children}</View>;
}
export function TitleRow({ title, accessory }: { title: string; accessory?: string }) {
  return <View style={[s.rowBetween, { marginBottom: 12 }]}><Text accessibilityRole="header" style={[s.sectionTitle, { flexShrink: 1 }]}>{title}</Text>{accessory && <Text style={s.caption}>{accessory}</Text>}</View>;
}

export function Field(props: React.ComponentProps<typeof TextInput> & { label: string; inputRef?: React.ComponentProps<typeof TextInput>['ref'] }) {
  const { label, inputRef, style, onFocus, onBlur, ...inputProps } = props;
  const [focused, setFocused] = useState(false);
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput ref={inputRef} accessibilityLabel={label} {...inputProps}
    onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[s.input, inputProps.multiline && { minHeight: 96, textAlignVertical: 'top' }, inputProps.editable === false && s.inputDisabled, focused && s.focused, style]} placeholderTextColor={C.muted} /></View>;
}
export function StatusMessage({ children, kind = 'info' }: { children: React.ReactNode; kind?: 'info' | 'error' | 'empty' | 'loading' }) {
  return <View style={[s.status, kind === 'error' && s.statusError, kind === 'empty' && s.statusEmpty]}>
    {kind === 'loading' && <ActivityIndicator color={C.blue} />}
    {kind !== 'loading' && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.statusIcon, kind === 'error' && { backgroundColor: '#FEE2E2' }]}><Text style={{ color: kind === 'error' ? '#991B1B' : C.blue, fontWeight: '800' }}>{kind === 'error' ? '!' : kind === 'empty' ? '—' : 'i'}</Text></View>}
    <Text accessibilityRole={kind === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.paragraph, { flexShrink: 1, color: kind === 'error' ? '#991B1B' : C.muted }]}>{children}</Text>
  </View>;
}
export function MedicineRow({ med, onPress, disabled = false }: { med: Medication; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: med.taken, disabled }} disabled={disabled} onPress={onPress} style={[s.medRow, disabled && { opacity: .6 }]}>
    <View style={[s.checkBox, med.taken && s.checked]}><Text style={{ color: C.white, fontWeight: '900' }}>{med.taken ? '✓' : ''}</Text></View>
    <View style={s.flex}><Text style={s.bodyStrong}>{med.title}</Text><Text style={s.caption}>{med.detail}</Text></View>
    <View style={{ alignItems: 'flex-end', minWidth: 54, maxWidth: 90, gap: 4 }}><Text style={s.timeText}>{med.time}</Text><Text style={{ fontSize: 13, color: med.taken ? C.green : C.subtle }}>{med.taken ? '완료' : '예정'}</Text></View>
  </Pressable>;
}
export function QuickTile({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} onPress={onPress} style={({ pressed }) => [s.quickLink, { opacity: pressed ? .75 : 1 }]}><View style={s.tileIcon}><AppIcon name={icon} /></View><Text style={s.bodyStrong}>{title}</Text><Text style={[s.caption, { marginTop: 5 }]}>{subtitle}</Text></Pressable>;
}
export function SummaryTile({ title, value, footer }: { title: string; value: string; footer: string }) {
  return <View style={s.tile}><Text style={s.caption}>{title}</Text><Text style={[s.bigValue, { marginVertical: 5 }]}>{value}</Text><Text style={s.caption}>{footer}</Text></View>;
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, flex: { flex: 1, minWidth: 0, minHeight: 0 }, page: { padding: 20, paddingBottom: 32, width: '100%', maxWidth: 880, alignSelf: 'center' },
  compactPage: { paddingHorizontal: 16 },
  authPage: { maxWidth: 520 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBetween: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%', flexShrink: 1 }, chipText: { fontSize: 13, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  action: { borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, minHeight: D.touch, minWidth: 0, flexShrink: 1, maxWidth: '100%' }, actionText: { fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 26, flexShrink: 1 },
  panel: { minWidth: 0, backgroundColor: C.white, borderRadius: D.radius.card, padding: D.spacing.card, borderWidth: 1.5, borderColor: '#E2E8F0', boxShadow: '0 2px 6px rgba(17,28,45,0.04)' },
  sectionTitle: { fontSize: D.typography.section, lineHeight: D.typography.sectionLine, fontWeight: '600', color: C.ink, flexShrink: 1 }, sectionGap: { marginTop: D.spacing.section },
  caption: { fontSize: 14, color: C.muted, lineHeight: 22, flexShrink: 1 }, paragraph: { fontSize: D.typography.body, color: C.muted, lineHeight: D.typography.bodyLine, flexShrink: 1 }, bodyStrong: { fontSize: 17, lineHeight: 28, fontWeight: '600', color: C.ink, flexShrink: 1 },
  h1: { fontSize: D.typography.heading, lineHeight: D.typography.headingLine, fontWeight: '700', color: C.navy, letterSpacing: -.3, flexShrink: 1 }, overline: { color: D.colors.onSecondaryContainer, fontSize: 14, lineHeight: 22, fontWeight: '600', marginBottom: 8, flexShrink: 1 },
  chipTextAlt: { color: C.blue }, brandMark: { height: 58, width: 58, backgroundColor: C.blue, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandSymbol: { color: C.white, fontSize: 26, fontWeight: '900' }, back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, marginBottom: 15 }, backText: { fontSize: 14, lineHeight: 22, fontWeight: '700', color: C.blue },
  field: { marginBottom: 18, minWidth: 0 }, fieldLabel: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: C.ink, marginBottom: 8 }, input: { minHeight: D.touch, minWidth: 0, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.pale, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, lineHeight: 28, color: C.ink }, link: { color: C.blue, lineHeight: 26, fontWeight: '700', fontSize: 16 },
  inputDisabled: { backgroundColor: C.pale, color: C.muted, borderColor: C.line }, focused: { borderColor: C.blue, boxShadow: '0 0 0 2px rgba(19,95,168,0.18)' },
  status: { backgroundColor: C.pale, borderRadius: 14, padding: 14, marginVertical: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  statusIcon: { width: 25, height: 25, borderRadius: 13, backgroundColor: C.container, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusError: { backgroundColor: '#FFF0EE' }, statusEmpty: { backgroundColor: C.pale },
  listItem: { paddingVertical: 16, gap: 6, borderBottomWidth: 1, borderColor: C.line }, confirmation: { marginTop: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 12 },
  demoPanel: { marginTop: 18, backgroundColor: C.container, padding: 16, borderRadius: 15, gap: 9 }, demoTitle: { fontSize: 13, fontWeight: '800', color: C.blue },
  heroLogo: { alignSelf: 'center', height: 116, width: 116, borderRadius: 32, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroHeart: { color: C.white, fontSize: 65, lineHeight: 89 }, heroCross: { position: 'absolute', color: C.white, fontSize: 20, fontWeight: '900', top: 44 },
  appName: { fontSize: 36, fontWeight: '700', color: C.navy, letterSpacing: -.4 }, welcomePanel: { backgroundColor: C.white, borderRadius: 22, padding: 18 },
  welcomeQuestion: { fontSize: 20, lineHeight: 30, fontWeight: '700', color: C.ink, marginBottom: 16 }, roleCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20, marginBottom: 16, minHeight: 120, boxShadow: '0 2px 4px rgba(17,28,45,0.06)' },
  roleIcon: { height: 56, width: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, roleEmoji: { fontSize: 29, color: C.blue }, roleTitle: { fontSize: 19, lineHeight: 28, fontWeight: '700', color: C.ink, marginBottom: 5 }, chevron: { fontSize: 27, color: C.subtle },
  appHeader: { backgroundColor: C.white, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 880, alignSelf: 'center' },
  smallBrand: { height: 40, width: 40, borderRadius: 20, backgroundColor: C.blue, justifyContent: 'center', alignItems: 'center' }, headerBrand: { fontSize: 22, fontWeight: '700', color: C.navy },
  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }, avatar: { height: 47, width: 47, flexShrink: 0, borderRadius: 16, backgroundColor: C.sage, justifyContent: 'center', alignItems: 'center' },
  hero: { borderRadius: 20, padding: 16 }, heroTag: { color: C.blue, fontWeight: '600', fontSize: 13, lineHeight: 20 }, heroTitle: { fontSize: 22, fontWeight: '600', color: C.navy, lineHeight: 32, marginTop: 18 }, heroDesc: { color: C.muted, fontSize: 14, lineHeight: 23, marginTop: 9 },
  heroMetrics: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(255,255,255,.65)', borderRadius: 14, padding: 15, marginTop: 20, alignItems: 'center', justifyContent: 'space-around' }, metricLabel: { color: C.muted, fontSize: 14, lineHeight: 22 }, metricValue: { color: C.navy, fontSize: 24, lineHeight: 34, fontWeight: '600', marginTop: 5 }, metricUnit: { fontSize: 13, fontWeight: '600' }, metricSeparator: { width: 1, height: 40, backgroundColor: '#C8DDEB' },
  progressTrack: { height: 9, backgroundColor: C.sage, borderRadius: 10, overflow: 'hidden', marginTop: 15, marginBottom: 9 }, progressFill: { height: 9, backgroundColor: C.blue, borderRadius: 10 },
  medRow: { flexDirection: 'row', minHeight: 76, alignItems: 'center', paddingVertical: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: C.line }, checkBox: { width: 28, height: 28, flexShrink: 0, borderRadius: 8, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: C.green, borderColor: C.green }, timeText: { color: C.ink, fontWeight: '800', fontSize: 14, lineHeight: 22 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, tile: { flexBasis: '46%', flexGrow: 1, minWidth: 120, backgroundColor: C.white, borderRadius: 20, padding: 16, minHeight: 104 }, tileIcon: { backgroundColor: C.pale, height: 44, width: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  bigValue: { fontSize: 30, fontWeight: '600', color: C.navy }, disclaimer: { fontSize: 14, color: C.muted, lineHeight: 23, marginTop: 18, textAlign: 'center' },
  alertSoft: { backgroundColor: C.container, borderRadius: 14, padding: 16, marginTop: 15 }, alertSoftText: { color: '#275785', fontSize: 14, lineHeight: 23, fontWeight: '600' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  wellnessOverview: { backgroundColor: C.mint, borderRadius: 24, padding: 18, marginTop: 4 },
  healthMetric: { flexGrow: 1, flexBasis: '44%', minWidth: 110, paddingVertical: 12, gap: 4 },
  quickLink: { flexBasis: '46%', flexGrow: 1, minWidth: 140, minHeight: 140, padding: 18, borderRadius: 16, borderWidth: 1.5, borderColor:C.line, backgroundColor:C.white, boxShadow:'0 2px 4px rgba(15,23,42,0.04)' },
  suggestionPill: { minHeight: D.touch, minWidth: 124, flexGrow: 1, borderRadius: 28, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', backgroundColor: C.white,borderWidth:1,borderColor:C.line },
  composerSurface: { width: '100%', maxWidth: 840, alignSelf: 'center', borderRadius: 24, backgroundColor: C.white, padding: 12,borderWidth:1.5,borderColor:C.line, boxShadow: '0 2px 4px rgba(15,23,42,0.04)' },
  quotePreview: { padding: 18, borderRadius: 12, backgroundColor: C.pale, marginVertical: 8, gap: 8 },
  sourceCard: { paddingVertical: 12, gap: 6, marginVertical: 6, minWidth: 0, borderTopWidth: 1, borderColor: C.line },
  bubble: { padding: 20, borderRadius: 20, marginBottom: 18, maxWidth: '94%', minWidth: 0 }, bubbleUser: { backgroundColor: C.blue, alignSelf: 'flex-end', borderBottomRightRadius: 6 }, bubbleAssistant: { backgroundColor: C.white, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 20, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  serviceCard: { backgroundColor: C.white, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16,borderWidth:1.5,borderColor:C.line,boxShadow:'0 2px 4px rgba(15,23,42,0.04)' }, serviceIcon: { width: 48, height: 48, flexShrink: 0, borderRadius: 12, backgroundColor: C.container, alignItems: 'center', justifyContent: 'center' },
  bottomNav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1.5, borderTopColor: C.line, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6, width: '100%', maxWidth: 880, alignSelf: 'center' }, navItem: { flex: 1, minWidth: 0, minHeight: 64, justifyContent: 'center', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 2, gap: 4, borderRadius: 12 }, navIcon: { fontSize: 23, fontWeight: '500' }, navLabel: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  delayChip: { backgroundColor: C.white, borderRadius: 9, minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8, flex: 1, borderWidth: 1, borderColor: C.line, alignItems: 'center' }, delaySelected: { backgroundColor: C.blue },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(9,19,36,.82)', justifyContent: 'center', padding: 24, zIndex: 100 }, sosDialog: { backgroundColor: C.danger, borderRadius: 23, padding: 24 }, sosTitle: { color: C.white, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 12 }, sosNumber: { color: C.white, fontSize: 73, fontWeight: '900', textAlign: 'center', marginVertical: 12 }, sosBody: { color: '#FEE2E2', lineHeight: 21, textAlign: 'center', fontSize: 13, marginBottom: 23 },
});
