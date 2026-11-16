import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { FeatureModal } from './FeatureModal';
import { Action, C, Panel, StatusMessage, s } from './ui';
import { healthNewsCardWidth, healthNewsDate, healthNewsPage, homeHealthNews, reviewedHealthNews, type HealthNewsItem } from '../services/healthNews';

export function HealthNewsCarousel({ items = homeHealthNews, onMore, loadItems }: { items?: readonly HealthNewsItem[]; onMore?: () => void; loadItems?: (signal: AbortSignal) => Promise<HealthNewsItem[]> }) {
  const [loaded, setLoaded] = useState<HealthNewsItem[] | null>(null);
  const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const news = reviewedHealthNews(loaded ?? items);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(280);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<HealthNewsItem | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  // Clear expired cards on a timer; no network or automatic KDCA collection.
  useEffect(() => {
    if (!loaded?.length) return;
    const expiry = Math.min(...loaded.map(item => Date.parse(item.validUntil ?? '')));
    const timer = setTimeout(() => { setLoaded([]); setSelected(null); }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [loaded]);
  async function refresh() {
    if (!loadItems || request.current) return;
    const current = new AbortController(); request.current = current; setLoading(true); setFailed(false);
    // Hide previous text while revalidating, including any open original.
    setLoaded([]); setSelected(null);
    try { const result = await loadItems(current.signal); if (!current.signal.aborted) setLoaded(result); }
    catch { if (!current.signal.aborted) { setLoaded([]); setFailed(true); } }
    finally { if (!current.signal.aborted) setLoading(false); if (request.current === current) request.current = null; }
  }
  const cardWidth = healthNewsCardWidth(width), step = cardWidth + 12;
  const current = healthNewsPage(page * step, step, news.length);
  function go(index: number) {
    const next = healthNewsPage(index * step, step, news.length);
    setPage(next); scroll.current?.scrollTo({ x: next * step, animated: true });
  }
  return <View style={s.sectionGap}>
    <View style={[s.rowBetween, { marginBottom: 12, flexWrap: 'wrap', gap: 8 }]}><Text accessibilityRole="header" style={s.sectionTitle}>공식 건강정보</Text>{onMore ? <Action label="더보기 · 자료 검색" small outline onPress={onMore} /> : <Text style={s.caption}>공식 자료로 알아봐요</Text>}</View>
    {loadItems && <Action label={loading ? '등록 자료 확인 중' : '등록 자료 새로고침'} small outline disabled={loading} onPress={() => void refresh()} />}
    {failed && <StatusMessage kind="error">등록 자료를 확인하지 못했어요. 이전 자료는 표시하지 않습니다.</StatusMessage>}
    {!news.length ? <Panel style={{ backgroundColor: C.sage, borderWidth: 0 }}>
      <Text style={s.bodyStrong}>건강소식 준비 중</Text>
      <Text style={[s.paragraph, { marginTop: 6 }]}>확인된 공식 건강정보를 준비하고 있어요. 자료가 연결되면 이곳에서 볼 수 있어요.</Text>
    </Panel> : <>
      <ScrollView ref={scroll} horizontal accessibilityLabel="건강소식 카드 목록" showsHorizontalScrollIndicator={false}
        snapToInterval={step} decelerationRate="fast" disableIntervalMomentum directionalLockEnabled nestedScrollEnabled
        onLayout={event => { const nextWidth = event.nativeEvent.layout.width; setWidth(nextWidth); scroll.current?.scrollTo({ x: current * (healthNewsCardWidth(nextWidth) + 12), animated: false }); }}
        onScroll={event => setPage(healthNewsPage(event.nativeEvent.contentOffset.x, step, news.length))} scrollEventThrottle={32}
        contentContainerStyle={{ gap: 12, paddingRight: Math.max(0, width - cardWidth), paddingBottom: 4 }}>
        {news.map((item, index) => <Pressable key={item.contentId} accessibilityRole="button" accessibilityLabel={`${item.title}, 상세 보기`}
          onPress={() => { setLinkFailed(false); setSelected(item); }}
          style={({ pressed }) => ({ width: cardWidth, minHeight: 180, padding: 20, borderRadius: 20, backgroundColor: [C.white, C.sage, C.container, C.lavender][index % 4], opacity: pressed ? .8 : 1, gap: 10 })}>
          <Text style={[s.caption, { color: C.green }]}>{item.category || '건강정보'}</Text>
          <Text style={s.sectionTitle}>{item.title}</Text>
          <Text numberOfLines={3} style={s.paragraph}>{item.summary || '원문과 출처를 확인해 주세요.'}</Text>
          <Text style={s.caption}>{item.publisher}{'\n'}{healthNewsDate(item)}</Text>
          <Text style={s.link}>자세히 보기 →</Text>
        </Pressable>)}
      </ScrollView>
      <View style={[s.rowBetween, { marginTop: 8 }]}>
        <Action label="이전 소식" outline small disabled={current === 0} onPress={() => go(current - 1)} />
        <View accessibilityLabel={`건강소식 ${current + 1} / ${news.length}`} style={{ alignItems: 'center', gap: 6 }}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[s.row, { gap: 5 }]}>{news.map(item => <View key={item.contentId} style={{ width: news[current]?.contentId === item.contentId ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: news[current]?.contentId === item.contentId ? C.blue : C.line }} />)}</View>
          <Text style={s.caption}>{current + 1} / {news.length}</Text>
        </View>
        <Action label="다음 소식" outline small disabled={current >= news.length - 1} onPress={() => go(current + 1)} />
      </View>
    </>}
    <FeatureModal visible={selected !== null} title={selected?.title || '건강소식'} fullHeight onClose={() => setSelected(null)}>
      {selected && <><Text style={s.caption}>{selected.category || '건강정보'} · {selected.publisher}{'\n'}{healthNewsDate(selected)}</Text>
        {selected.attributionNotice && <Text selectable style={s.caption}>{selected.attributionNotice}</Text>}
        <Text selectable style={s.paragraph}>{selected.content || selected.summary || '아래 공식 원문에서 내용을 확인해 주세요.'}</Text>
        {selected.termsLabel && <Text style={s.caption}>{selected.termsLabel}</Text>}
        {selected.termsUrl && <Action label="이용 조건 확인" outline onPress={() => { void Linking.openURL(selected.termsUrl!).catch(() => setLinkFailed(true)); }} />}
        <Action label="공식 원문 열기" outline onPress={() => { void Linking.openURL(selected.sourceUrl).catch(() => setLinkFailed(true)); }} />
        {linkFailed && <StatusMessage kind="error">원문을 열지 못했어요. 인터넷 연결을 확인해 주세요.</StatusMessage>}</>}
    </FeatureModal>
  </View>;
}
