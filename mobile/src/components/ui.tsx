import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Medication } from '../features/app/types';

export const C = {
  blue: '#135FA8', blue2: '#2A83D4', green: '#07966D', navy: '#14243D',
  ink: '#1E293B', muted: '#64748B', subtle: '#94A3B8', bg: '#F5F8FC',
  line: '#E4EAF2', white: '#FFFFFF', danger: '#DC2626', pale: '#EAF4FF',
};
export function Chip({ text, kind = 'blue' }: { text: string; kind?: 'blue' | 'green' | 'red' | 'neutral' }) {
  const bg = { blue: '#E6F1FF', green: '#DCFCE7', red: '#FEE2E2', neutral: '#EDF2F7' }[kind];
  const color = { blue: C.blue, green: '#047857', red: C.danger, neutral: C.muted }[kind];
  return <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color }]}>{text}</Text></View>;
}
export function Action({ label, onPress, outline = false, danger = false, small = false }: {
  label: string; onPress: () => void; outline?: boolean; danger?: boolean; small?: boolean;
}) {
  const color = danger ? C.danger : C.blue;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.action,
    { backgroundColor: outline ? C.white : color, borderColor: color, paddingVertical: small ? 11 : 15, opacity: pressed ? .78 : 1 }]}>
    <Text style={[s.actionText, { color: outline ? color : C.white, fontSize: small ? 13 : 16 }]}>{label}</Text>
  </Pressable>;
}
export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.panel, style]}>{children}</View>;
}
export function TitleRow({ title, accessory }: { title: string; accessory?: string }) {
  return <View style={s.rowBetween}><Text style={s.sectionTitle}>{title}</Text>{accessory && <Text style={s.caption}>{accessory}</Text>}</View>;
}

export function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput {...inputProps} style={s.input} placeholderTextColor={C.subtle} /></View>;
}
export function MedicineRow({ med, onPress }: { med: Medication; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: med.taken }} onPress={onPress} style={s.medRow}>
    <View style={[s.checkBox, med.taken && s.checked]}><Text style={{ color: C.white, fontWeight: '900' }}>{med.taken ? '✓' : ''}</Text></View>
    <View style={s.flex}><Text style={s.bodyStrong}>{med.title}</Text><Text style={s.caption}>{med.detail}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={s.timeText}>{med.time}</Text><Text style={{ fontSize: 11, color: med.taken ? C.green : C.subtle }}>{med.taken ? '완료' : '예정'}</Text></View>
  </Pressable>;
}
export function QuickTile({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.tile, { opacity: pressed ? .75 : 1 }]}><View style={s.tileIcon}><Text style={{ color: C.blue, fontSize: 25 }}>{icon}</Text></View><Text style={s.bodyStrong}>{title}</Text><Text style={[s.caption, { marginTop: 5 }]}>{subtitle}</Text></Pressable>;
}
export function SummaryTile({ title, value, footer }: { title: string; value: string; footer: string }) {
  return <View style={s.tile}><Text style={s.caption}>{title}</Text><Text style={[s.bigValue, { marginVertical: 5 }]}>{value}</Text><Text style={s.caption}>{footer}</Text></View>;
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, flex: { flex: 1 }, page: { padding: 20, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' }, chipText: { fontSize: 11, fontWeight: '800' },
  action: { borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, minHeight: 44 }, actionText: { fontWeight: '800', textAlign: 'center' },
  panel: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 19, elevation: 1, shadowColor: '#173D66', shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: C.ink }, sectionGap: { marginTop: 24 },
  caption: { fontSize: 12, color: C.muted, lineHeight: 18 }, paragraph: { fontSize: 14, color: C.muted, lineHeight: 22 }, bodyStrong: { fontSize: 14, fontWeight: '800', color: C.ink },
  h1: { fontSize: 26, fontWeight: '900', color: C.navy, letterSpacing: -.7 }, overline: { color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  chipTextAlt: { color: C.blue }, brandMark: { height: 58, width: 58, backgroundColor: C.blue, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  brandSymbol: { color: C.white, fontSize: 26, fontWeight: '900' }, back: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 15 }, backText: { fontSize: 14, fontWeight: '700', color: C.blue },
  field: { marginBottom: 17 }, fieldLabel: { fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 8 }, input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#D6E1EC', backgroundColor: C.white, paddingHorizontal: 14, fontSize: 15, color: C.ink }, link: { color: C.blue, fontWeight: '700', fontSize: 13 },
  demoPanel: { marginTop: 18, backgroundColor: '#E8F3FF', padding: 16, borderRadius: 15, gap: 9 }, demoTitle: { fontSize: 13, fontWeight: '800', color: C.blue },
  heroLogo: { alignSelf: 'center', height: 116, width: 116, borderRadius: 32, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroHeart: { color: C.white, fontSize: 65, lineHeight: 89 }, heroCross: { position: 'absolute', color: C.white, fontSize: 20, fontWeight: '900', top: 44 },
  appName: { fontSize: 44, fontWeight: '900', color: C.navy, letterSpacing: -.6 }, welcomePanel: { backgroundColor: C.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line },
  welcomeQuestion: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 16 }, roleCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 12, marginBottom: 11 },
  roleIcon: { height: 53, width: 53, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, roleEmoji: { fontSize: 29, color: C.blue }, roleTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 5 }, chevron: { fontSize: 27, color: C.subtle },
  appHeader: { backgroundColor: C.white, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallBrand: { height: 33, width: 33, borderRadius: 9, backgroundColor: C.blue, justifyContent: 'center', alignItems: 'center' }, headerBrand: { fontSize: 19, fontWeight: '900', color: C.navy },
  greeting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }, avatar: { height: 47, width: 47, borderRadius: 16, backgroundColor: '#E9F1FA', justifyContent: 'center', alignItems: 'center' },
  hero: { borderRadius: 22, padding: 20 }, heroTag: { color: '#D1E5FF', fontWeight: '800', fontSize: 12 }, heroTitle: { fontSize: 22, fontWeight: '900', color: C.white, lineHeight: 30, marginTop: 18 }, heroDesc: { color: '#D2E7FF', fontSize: 12, lineHeight: 18, marginTop: 9 },
  heroMetrics: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 14, padding: 15, marginTop: 20, alignItems: 'center', justifyContent: 'space-around' }, metricLabel: { color: '#DEEDFF', fontSize: 12 }, metricValue: { color: C.white, fontSize: 24, fontWeight: '900', marginTop: 5 }, metricUnit: { fontSize: 12, fontWeight: '600' }, metricSeparator: { width: 1, height: 40, backgroundColor: '#7EADE3' },
  progressTrack: { height: 9, backgroundColor: '#DFE9F4', borderRadius: 10, overflow: 'hidden', marginTop: 15, marginBottom: 9 }, progressFill: { height: 9, backgroundColor: C.blue, borderRadius: 10 },
  medRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, gap: 12, borderBottomWidth: 1, borderBottomColor: '#EDF1F6' }, checkBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: C.green, borderColor: C.green }, timeText: { color: C.ink, fontWeight: '800', fontSize: 13 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }, tile: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 19, padding: 17, minHeight: 128, elevation: 1 }, tileIcon: { backgroundColor: '#EAF3FF', height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  bigValue: { fontSize: 33, fontWeight: '900', color: C.navy }, disclaimer: { fontSize: 11, color: C.muted, lineHeight: 18, marginTop: 18, textAlign: 'center' },
  alertSoft: { backgroundColor: '#E8F3FF', borderRadius: 13, padding: 14, marginTop: 15 }, alertSoftText: { color: '#275785', fontSize: 12, lineHeight: 19, fontWeight: '600' },
  bubble: { padding: 13, borderRadius: 15, marginBottom: 10, maxWidth: '92%' }, bubbleUser: { backgroundColor: C.green, alignSelf: 'flex-end', borderBottomRightRadius: 4 }, bubbleAssistant: { backgroundColor: '#EFF4F8', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  serviceCard: { backgroundColor: C.white, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 }, serviceIcon: { width: 51, height: 51, borderRadius: 14, backgroundColor: '#EDF5FF', alignItems: 'center', justifyContent: 'center' },
  bottomNav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 11, paddingBottom: 8 }, navItem: { flex: 1, alignItems: 'center', paddingVertical: 5, gap: 2 }, navIcon: { fontSize: 23, fontWeight: '800' }, navLabel: { fontSize: 10 },
  delayChip: { backgroundColor: C.white, borderRadius: 9, paddingVertical: 12, flex: 1, borderWidth: 1, borderColor: '#CDE3FF', alignItems: 'center' }, delaySelected: { backgroundColor: C.blue },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(9,19,36,.82)', justifyContent: 'center', padding: 24, zIndex: 100 }, sosDialog: { backgroundColor: C.danger, borderRadius: 23, padding: 24 }, sosTitle: { color: C.white, fontSize: 23, fontWeight: '900', textAlign: 'center', marginTop: 12 }, sosNumber: { color: C.white, fontSize: 73, fontWeight: '900', textAlign: 'center', marginVertical: 12 }, sosBody: { color: '#FEE2E2', lineHeight: 21, textAlign: 'center', fontSize: 13, marginBottom: 23 },
});
