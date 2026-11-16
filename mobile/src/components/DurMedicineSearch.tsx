import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { DUR_SOURCE_URL, type DurCandidate, type DurDrug, type DurSearchResult } from '../services/durContract';
import { durConfigured, searchPrescriptionDrugs } from '../services/prescriptionAnalysis';
import { Action, Chip, Field, StatusMessage, s } from './ui';

// Transient medicine search only. No image access, persistence or patient identifiers.
export function DurMedicineSearch({ selected, onSelect, disabled = false, automatic = false, selectedList }: { selected: DurDrug[]; onSelect: (medicine: DurCandidate) => void; disabled?: boolean; automatic?: boolean; selectedList?: ReactNode }) {
  const [query, setQuery] = useState(''), [consent, setConsent] = useState(false);
  const [result, setResult] = useState<DurSearchResult | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const attempt = useRef<{ query: string; page: number } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(new Map<string, { value: DurSearchResult; until: number }>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  function cancel() { if (debounce.current) clearTimeout(debounce.current); active.current?.abort(); active.current = null; setLoading(false); }
  function change(value: string) { cancel(); setQuery(value); setResult(null); setError(''); attempt.current = null; }
  const run = useCallback(async (input: { query: string; page: number }) => {
    if (active.current || disabled || !consent || !durConfigured()) return;
    if (input.query.length < 2) { setError('약품명을 2자 이상 입력해 주세요.'); return; }
    if (debounce.current) clearTimeout(debounce.current);
    const cacheKey = JSON.stringify(input), saved = cache.current.get(cacheKey);
    if (saved && saved.until > Date.now()) {
      setResult(previous => input.page > 1 && previous?.query === saved.value.query ? { ...saved.value, candidates: [...previous.candidates, ...saved.value.candidates.filter(c => !previous.candidates.some(old => old.itemSeq === c.itemSeq))] } : saved.value);
      setError(''); return;
    }
    const request = new AbortController(); active.current = request; attempt.current = input;
    setLoading(true); setError('');
    if (input.page === 1) setResult(null);
    try {
      const data = await searchPrescriptionDrugs(input.query, input.page, request.signal);
      if (mounted.current && active.current === request && !request.signal.aborted) {
        if (cache.current.size >= 20) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(cacheKey, { value: data, until: Date.now() + 300000 });
      }
      if (mounted.current && active.current === request && !request.signal.aborted) setResult(previous => input.page > 1 && previous?.query === data.query
        ? { ...data, candidates: [...previous.candidates, ...data.candidates.filter(c => !previous.candidates.some(old => old.itemSeq === c.itemSeq))] } : data);
    } catch (cause) {
      if (mounted.current && active.current === request) setError(cause instanceof Error ? cause.message : '약품을 검색하지 못했습니다. 다시 시도해 주세요.');
    } finally { if (mounted.current && active.current === request) { active.current = null; setLoading(false); } }
  }, [consent, disabled]);
  useEffect(() => {
    if (!automatic || !consent || disabled || query.trim().length < 2) return;
    debounce.current = setTimeout(() => { void run({ query: query.trim(), page: 1 }); }, 700);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [automatic, consent, disabled, query, run]);
  return <View style={{ gap: 10, marginBottom: 18 }}>
    <Text style={s.sectionTitle}>의약품명 검색·선택</Text>
    <Text style={s.caption}>식약처 병용금기 등록 품목에서 검색합니다. 전체 의약품 목록이 아니며, 검색되지 않아도 안전하다는 의미가 아닙니다.</Text>
    <Field label="검색할 약품명" value={query} onChangeText={change} maxLength={100} editable={!disabled} autoCorrect={false} autoCapitalize="none" placeholder="처방전에 적힌 약품명 (2자 이상)" returnKeyType="search" onSubmitEditing={() => { void run({ query: query.trim(), page: 1 }); }} />
    {selectedList}
    <View style={[s.row, { alignItems: 'center', gap: 10 }]}><Switch value={consent} disabled={disabled} accessibilityLabel="검색 약품명을 서버와 식약처에 전송하는 데 동의" onValueChange={value => { cancel(); setConsent(value); if (!value) { cache.current.clear(); setResult(null); setError(''); } }} /><Text style={[s.caption, { flex: 1 }]}>검색어를 서버·식약처에 전송하는 데 동의합니다.{automatic ? ' 2자 이상 입력하면 0.7초 후 자동 검색합니다.' : ''} 개인정보는 입력하지 마세요.</Text></View>
    {!automatic && <Action label={loading ? '의약품 검색 중' : '의약품 검색'} disabled={!durConfigured() || disabled || loading || !consent || query.trim().length < 2} onPress={() => { void run({ query: query.trim(), page: 1 }); }} />}
    {!durConfigured() && <StatusMessage>서버 배포·연결 확인 후 의약품 검색을 사용할 수 있습니다.</StatusMessage>}
    {loading && <><StatusMessage kind="loading">공식 품목정보를 조회하고 있습니다.</StatusMessage><Action label="의약품 검색 취소" outline onPress={cancel} /></>}
    {!!error && <><StatusMessage kind="error">{error}</StatusMessage><Action label="의약품 검색 다시 시도" outline disabled={loading || disabled || !consent} onPress={() => { if (attempt.current) void run(attempt.current); }} /></>}
    {result && <>
      <Text accessibilityLiveRegion="polite" style={s.caption}>검색된 품목 {result.candidates.length}개 · 조회 {new Date(result.checkedAt).toLocaleString()}</Text>
      {!result.candidates.length && <StatusMessage kind="empty">현재 조회 범위에 일치하는 품목이 없습니다. 정확한 제품명·함량을 확인하거나 다음 페이지를 확인하세요. 약품의 존재나 안전 여부를 판정한 결과가 아닙니다.</StatusMessage>}
      {result.candidates.map(c => {
        const chosen = selected.some(d => d.itemSeq === c.itemSeq);
        const select = () => { if (chosen || disabled || selected.length >= 6) return; onSelect(c); if (automatic) change(''); };
        return <Pressable key={c.itemSeq} accessibilityRole="button" accessibilityLabel={`${c.name} · 품목 ${c.itemSeq} ${chosen ? '선택됨' : '선택'}`} accessibilityState={{ disabled: chosen || disabled || selected.length >= 6 }} disabled={chosen || disabled || selected.length >= 6} onPress={select} style={s.listItem}>
          <Text style={s.bodyStrong}>{c.name}</Text>
          <Text style={s.caption}>제조사: {c.manufacturer ?? '제공 정보 없음'} · 품목코드: {c.itemSeq}</Text>
          <Text style={s.caption}>성분 참고: {c.ingredient ?? '제공 정보 없음'} · 전체 성분·함량 동일성은 별도 확인 필요</Text>
          {chosen && <Chip text="선택됨" kind="neutral" />}
          <Text style={s.caption}>{chosen ? '선택됨' : '카드를 눌러 선택'}</Text>
        </Pressable>;
      })}
      {result.truncated && <Text style={s.caption}>병용금기 등록 행 일부를 조회했습니다. 중복 품목을 묶어 표시하므로 전체 의약품 수와 다릅니다. 최대 3페이지까지 조회합니다.</Text>}
      {result.hasMore && <Action label="의약품 검색 결과 더 보기" outline disabled={loading || disabled || !consent || !!error} onPress={() => { void run({ query: result.query, page: result.page + 1 }); }} />}
    </>}
    {!automatic && <Action label="식약처 DUR 공식 출처 보기 ↗" outline small onPress={() => { void Linking.openURL(DUR_SOURCE_URL).catch(() => setError('공식 출처 페이지를 열지 못했습니다. 인터넷 연결을 확인해 주세요.')); }} />}
  </View>;
}
