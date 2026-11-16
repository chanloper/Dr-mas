import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { Action, Panel, StatusMessage, TitleRow, s } from './ui';
import { FeatureModal } from './FeatureModal';
import { checkPrescriptionDur } from '../services/prescriptionAnalysis';
import { DUR_SOURCE_URL, type DurCandidate, type DurResult } from '../services/durContract';
import { DurMedicineSearch } from './DurMedicineSearch';

export const PUBLIC_MEDICINE_SEARCH_URL = 'https://nedrug.mfds.go.kr/searchDrug';

// Public external search only. No patient IDs, prescription images or API keys.
export function PublicMedicineInfo() {
  const [error, setError] = useState(false);
  const [durOpen, setDurOpen] = useState(false);
  async function openSearch() {
    setError(false);
    try { await Linking.openURL(PUBLIC_MEDICINE_SEARCH_URL); } catch { setError(true); }
  }
  return <Panel>
    <TitleRow title="공개 의약품 정보 검색" />
    <Text style={s.paragraph}>환자와 보호자 모두 식약처 의약품안전나라에서 제품명·성분명으로 공개 정보를 검색할 수 있습니다.</Text>
    <View style={{ marginTop: 14 }}><Action label="식약처 의약품 검색 열기 · 외부 브라우저" onPress={() => { void openSearch(); }} /></View>
    {error && <StatusMessage kind="error">공식 검색 페이지를 열지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.</StatusMessage>}
    <StatusMessage>연결 환자의 실제 처방전이나 복약 기록을 조회하지 않습니다. 개인정보는 검색어에 입력하지 마세요. 의약품 정보만으로 복용·변경 여부를 결정하지 말고 의료진·약사와 상의하세요.</StatusMessage>
    <Action label="DUR 병용금기 정보 조회" onPress={() => setDurOpen(true)} />
    <FeatureModal visible={durOpen} title="DUR 병용금기 정보" onClose={() => setDurOpen(false)}>
      {durOpen && <DurPanel />}
    </FeatureModal>
  </Panel>;
}

// Transient authenticated reference lookup; no images, persistence or patient IDs.
export function DurPanel() {
  const [selected, setSelected] = useState<DurCandidate[]>([]);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<DurResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, { value: DurResult; until: number }>());
  const selectionKey = JSON.stringify(selected.map(({ name, itemSeq }) => ({ name, itemSeq })).sort((a, b) => a.itemSeq.localeCompare(b.itemSeq)));
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  function edit(next: DurCandidate[]) { active.current?.abort(); active.current = null; setBusy(false); setSelected(next); setResult(null); setError(''); setOtherOpen(false); }
  useEffect(() => {
    if (!consent || JSON.parse(selectionKey).length < 2) return;
    const request = new AbortController(); active.current = request;
    const timer = setTimeout(async () => {
      const saved = cache.current.get(selectionKey);
      if (saved && saved.until > Date.now()) { setResult(saved.value); active.current = null; return; }
      setResult(null); setError(''); setOtherOpen(false);
      setBusy(true);
      try {
        const value = await checkPrescriptionDur(JSON.parse(selectionKey), request.signal);
        if (active.current === request && !request.signal.aborted) {
          if (cache.current.size >= 20) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(selectionKey, { value, until: Date.now() + 300000 }); setResult(value);
        }
      } catch (cause) {
        if (active.current === request && !request.signal.aborted) setError(cause instanceof Error ? cause.message : '조회하지 못했습니다.');
      } finally { if (active.current === request) { active.current = null; setBusy(false); } }
    }, 700);
    return () => { clearTimeout(timer); request.abort(); if (active.current === request) active.current = null; };
  }, [selectionKey, consent, retry]);
  const warningKey = (w: DurResult['warnings'][number]) => JSON.stringify([[w.first, w.second].sort(), w.content]);
  const warnings = result?.warnings.filter((w, index, all) => all.findIndex(x => warningKey(x) === warningKey(w)) === index) ?? [];
  const warningGroups = [...new Map(warnings.map(w => [JSON.stringify([w.first, w.second].sort()), { first: w.first, second: w.second }])).values()];
  const otherNotices = result?.notices?.filter(n => !warnings.some(w => n.content === w.content && (n.name === w.first && n.counterpart === w.second || n.name === w.second && n.counterpart === w.first))) ?? [];
  const incomplete = result?.drugs.some(d => !d.identityConfirmed || d.truncated);
  return <View style={{ gap: 12 }}>
    <StatusMessage>식약처 DUR 품목정보 중 병용금기만 조회합니다. 개인별 안전성 검사나 약 추천이 아닙니다. 검색되지 않거나 금기 일치가 없어도 병용 안전성을 보장하지 않습니다.</StatusMessage>
    <DurMedicineSearch selected={selected} automatic selectedList={<View style={{ gap: 8 }}>
      <Text style={s.bodyStrong}>선택 품목 {selected.length}/6</Text>
      {selected.map(d => <View key={d.itemSeq} style={[s.row, { alignItems: 'center', gap: 8 }]}><View style={{ flex: 1 }}><Text style={s.bodyStrong}>{d.name}</Text><Text style={s.caption}>품목 {d.itemSeq} · {d.manufacturer ?? '제조사 미제공'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${d.name} 제거`} style={{ padding: 12, minHeight: 48, minWidth: 48 }} onPress={() => edit(selected.filter(x => x.itemSeq !== d.itemSeq))}><Text style={s.bodyStrong}>×</Text></Pressable></View>)}
    </View>} onSelect={candidate => {
      if (!selected.some(d => d.itemSeq === candidate.itemSeq) && selected.length < 6) edit([...selected, candidate]);
    }} />
    <View style={[s.row, { alignItems: 'center', gap: 10 }]}><Switch value={consent} accessibilityLabel="선택 품목 자동 조회 전송 동의" onValueChange={value => { active.current?.abort(); active.current = null; setBusy(false); setConsent(value); if (!value) { cache.current.clear(); setResult(null); setError(''); } }} /><Text style={[s.caption, { flex: 1 }]}>선택 약품명·품목코드를 서버·식약처로 전송하여 자동 병용금기 조회하는 데 동의합니다. 2개 이상 선택하거나 변경하면 자동 갱신합니다. 개인정보·이미지는 저장·전송하지 않습니다.</Text></View>
    {selected.length < 2 && <Text style={s.caption}>비교할 공식 품목을 2개 이상 선택하세요.</Text>}
    {busy && <StatusMessage kind="loading">선택 품목 간 병용금기 자동 조회 중…</StatusMessage>}
    {!!error && <><StatusMessage kind="error">조회 실패 · {error}</StatusMessage><Action outline small label="DUR 조회 다시 시도" onPress={() => { setError(''); setRetry(v => v + 1); }} /></>}
    {result && <>
      <Text style={s.sectionTitle}>공식 조회 결과 · 병용금기</Text>
      {warningGroups.map((w, i) => <StatusMessage kind="error" key={`pair:${i}`}>선택 품목 간 병용금기 · {w.first} / {w.second}{'\n'}{warnings.filter(x => [x.first, x.second].sort().join('|') === [w.first, w.second].sort().join('|')).map(x => x.content).join('\n')}</StatusMessage>)}
      {incomplete && <StatusMessage>조회 불완전 · 품목 식별 미확인 또는 페이지 제한으로 일부 정보만 조회됐습니다. 전체 조합을 확인한 결과가 아닙니다.</StatusMessage>}
      {!warnings.length && <StatusMessage kind="empty">{incomplete ? '조회된 범위에서 선택 조합의 금기 일치를 찾지 못했습니다.' : '선택 조합의 금기 일치 정보가 없습니다.'} 병용 안전성을 보장하지 않습니다.</StatusMessage>}
      <Text style={s.caption}>{result.drugs.map(d => `${d.name}: ${d.identityConfirmed ? '코드 일치' : '식별 미확인'}${d.truncated ? ' · 일부 조회' : ''}`).join('\n')}</Text>
      {!!otherNotices.length && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: otherOpen }} style={{ paddingVertical: 12 }} onPress={() => setOtherOpen(v => !v)}><Text style={s.bodyStrong}>{otherOpen ? '▾' : '▸'} 기타 공식 등록 정보 ({otherNotices.length}건)</Text></Pressable>{otherOpen && <><Text style={s.caption}>아래는 선택 조합 일치로 확인한 결과와 구분되는 품목별 원문입니다.</Text>{otherNotices.map((n, i) => <View style={s.listItem} key={`notice:${i}`}><Text style={s.bodyStrong}>{n.name}</Text><Text style={s.caption}>상대 품목: {n.counterpart ?? '미제공'}</Text><Text style={s.paragraph}>{n.content}</Text></View>)}</>}</>}
      <Text style={s.caption}>출처: 식품의약품안전처 의약품안전사용서비스(DUR) 품목정보 · 병용금기. {result.checkedAt ? `조회: ${new Date(result.checkedAt).toLocaleString()}` : '조회 시각 미제공'}. 약 변경·중단은 의료진과 상의하세요.</Text>
    </>}
    <Action small outline label="공식 DUR 출처 보기 ↗" onPress={() => { void Linking.openURL(DUR_SOURCE_URL).catch(() => setError('공식 출처를 열지 못했습니다.')); }} />
  </View>;
}
