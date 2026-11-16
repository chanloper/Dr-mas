import { ActivityIndicator, Linking, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, C, Field, Panel, StatusMessage, s } from '../components/ui';
import { usePlaceSearch } from '../features/places/usePlaceSearch';
import { safeDetailUrl } from '../services/placeContract';
import { useRef, useState, type ComponentRef } from 'react';
import { placeSearchConfigured } from '../services/places';
import { EmergencyCallButton } from '../components/EmergencyCallButton';
import { PlaceDetailsModal } from '../components/PlaceDetailsModal';
import type { Place } from '../services/placesClient';
import { placeRouteCategory } from '../services/placeRoute';
import { HiraReferencePanel } from '../components/HiraReferencePanel';
import { PlaceMap } from '../components/PlaceMap';

export function generateMetadata() {
  return { title: '병원 · 약국 찾기 | Dr.MAS', description: '현재 위치와 키워드로 병원과 약국을 찾아보세요.' };
}

export default function PlacesScreen() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const category = placeRouteCategory(params.category);
  return <PlacesContent key={category} initialCategory={category} />;
}

export function PlacesContent({ initialCategory, onClose }: { initialCategory: 'hospital' | 'pharmacy'; onClose?: () => void }) {
  const router = useRouter(), search = usePlaceSearch(initialCategory);
  const { width } = useWindowDimensions();
  const configured = placeSearchConfigured();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null), mapY = useRef(0);
  async function openDetail(url: string) {
    setLinkError(null);
    try { await Linking.openURL(safeDetailUrl(url)); } catch { setLinkError('장소 상세 페이지를 열지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  }
  return <SafeAreaView style={s.root} edges={onClose ? [] : ['top', 'bottom']}><KeyboardAvoidingView style={s.flex} behavior={onClose ? undefined : Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
    <ScrollView ref={scroll} style={s.flex} contentContainerStyle={[s.page, width < 380 && s.compactPage]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      <Pressable accessibilityRole="button" style={s.back} onPress={() => onClose ? onClose() : router.canGoBack() ? router.back() : router.replace('/')}><Text style={s.backText}>‹ 돌아가기</Text></Pressable>
      <View style={[s.rowBetween,{backgroundColor:C.container,padding:16,borderRadius:12,marginBottom:16}]}><Text style={[s.bodyStrong,{color:C.blue}]}>내 주변 건강 파트너</Text><Text style={s.caption}>카카오 검색 · 지도 연동</Text></View>
      <Text style={s.h1}>가까운 병원과 약국</Text>
      <Text style={[s.paragraph, { marginTop: 8, marginBottom: 20 }]}>지역이나 이름으로 찾고, 지도에서 위치를 확인하세요.</Text>
      <View style={[s.row, { gap: 10, marginBottom: 15 }]}>{(['hospital', 'pharmacy'] as const).map(category => <Pressable key={category} accessibilityRole="radio" accessibilityState={{ checked: search.category === category }} onPress={() => search.chooseCategory(category)} style={[s.delayChip, search.category === category && s.delaySelected]}>
        <Text style={{ color: search.category === category ? C.white : C.ink, fontWeight: '700' }}>{category === 'hospital' ? '병원' : '약국'}</Text>
      </Pressable>)}</View>
      <Panel>
        {!configured && <StatusMessage>병원·약국 검색 서비스 연결을 준비 중입니다. 현재는 검색을 이용할 수 없습니다.</StatusMessage>}
        <Field label="지역명 · 기관명" accessibilityLabel="검색할 지역명 또는 기관명" value={search.keyword} onChangeText={search.changeKeyword} maxLength={80} placeholder="지역명 또는 기관명 입력 (2자 이상)" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => { if (configured && search.keyword.trim().length >= 2) void search.run('keyword'); }} />
        <Action label="키워드 검색" disabled={!configured || search.loading || search.keyword.trim().length < 2} onPress={() => { void search.run('keyword'); }} />
        <View style={{ height: 10 }} /><Action label="현재 위치로 주변 3km 검색" outline disabled={!configured || search.loading} onPress={() => { void search.run('nearby'); }} />
        <Text style={[s.caption, { marginTop: 10 }]}>주변 검색 시 위치를 검색 서버·카카오에 전달해요. 저장하지 않으며, 권한 없이도 지역명 검색은 가능해요.</Text>
      </Panel>
      {search.loading && <View style={[s.row, { gap: 10, marginVertical: 15 }]}><ActivityIndicator color={C.blue} /><Text accessibilityLiveRegion="polite" style={s.paragraph}>검색 정보를 확인하고 있습니다.</Text></View>}
      {search.error && <StatusMessage kind="error">{search.error}</StatusMessage>}
      {linkError && <StatusMessage kind="error">{linkError}</StatusMessage>}
      {search.searched && !search.loading && !search.error && search.places.length === 0 && <StatusMessage kind="empty">검색 결과가 없습니다. 다른 지역명이나 기관명으로 검색해 주세요.</StatusMessage>}
      {configured && !search.searched && !search.loading && !search.error && <StatusMessage kind="empty">지역명이나 기관명을 입력해 검색을 시작해 보세요.</StatusMessage>}
      {!search.places.length && <Action label="기관 상세 항목 보기" outline small onPress={() => { setSelected(null); setDetailsOpen(true); }} />}
      {!!search.places.length && <View onLayout={event=>{mapY.current=event.nativeEvent.layout.y;}}><PlaceMap places={search.places} selected={search.places.find(p=>p.id===selected?.id)??null} onSelect={place=>{setSelected(place);setLinkError(null);}} onDetails={place=>{setSelected(place);setDetailsOpen(true);}} /></View>}
      {!!search.places.length && <Text style={[s.sectionTitle,{marginTop:22,marginBottom:8}]}>찾은 {search.category==='hospital'?'병원':'약국'} · {search.places.length}곳</Text>}
      {search.places.map((place,index) => <View key={place.id}><Pressable accessibilityRole="button" accessibilityLabel={`${place.name}, ${place.coordinates?'지도에서 선택':'기관 선택'}`} accessibilityState={{selected:selected?.id===place.id}} onPress={() => { setLinkError(null); setSelected(place); if(place.coordinates)scroll.current?.scrollTo({y:mapY.current,animated:true}); }} style={({ pressed }) => [s.serviceCard, { marginTop: 8, marginBottom:4, borderWidth:1,borderColor:selected?.id===place.id?C.blue:'transparent', opacity: pressed ? .75 : 1 }]}>
        <View style={[s.serviceIcon,{backgroundColor:selected?.id===place.id?C.blue:C.mint}]}><Text style={[s.bodyStrong,{color:selected?.id===place.id?C.white:C.blue}]}>{index+1}</Text></View>
        <View style={s.flex}><Text style={s.bodyStrong}>{place.name}</Text><Text style={s.caption}>출처 · 카카오맵</Text><Text style={s.caption}>{place.category}</Text>
          <Text style={[s.paragraph, { marginTop: 6 }]}>{place.roadAddress || place.address || '주소 정보 없음'}</Text>
          <Text style={s.caption}>{place.phone || '전화번호 정보 없음'}{place.distanceMeters !== null ? ` · ${place.distanceMeters < 1000 ? `${Math.round(place.distanceMeters)}m` : `${(place.distanceMeters / 1000).toFixed(1)}km`}` : ''}</Text>
          <Text style={[s.link, { marginTop: 7 }]}>{place.coordinates?'지도에서 위치 선택 →':'좌표 정보 없음 · 아래 상세에서 지도 확인'}</Text>
        </View>
      </Pressable><View style={{marginBottom:12}}><Action label={`${place.name} 상세 보기`} outline small onPress={()=>{setSelected(place);setDetailsOpen(true);}} /></View></View>)}
      {search.searched && !search.isEnd && <Action label="결과 더 보기" outline disabled={search.loading} onPress={() => { void search.run('more'); }} />}
      <View style={[s.alertSoft, { marginVertical: 20 }]}><Text style={s.alertSoftText}>검색 정보 제공: 카카오맵. 기관의 의료적 품질이나 실시간 영업·진료 여부를 보증하지 않습니다. 방문 전 기관에 확인해 주세요. 응급실 가용 정보가 아니며 응급 상황에서는 119에 연락하세요.</Text></View>
      {search.category === 'hospital' && <Panel><HiraReferencePanel kind="hospital" /></Panel>}
      <Panel><Text style={[s.sectionTitle, { marginBottom: 12 }]}>응급 상황 · 119 직접 전화</Text><EmergencyCallButton /></Panel>
      <PlaceDetailsModal place={selected} visible={detailsOpen} onClose={() => { setSelected(null); setDetailsOpen(false); }} onOpenMap={url => { setSelected(null); setDetailsOpen(false); void openDetail(url); }} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
