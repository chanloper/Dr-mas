import { ActivityIndicator, Linking, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, C, Field, Panel, s } from '../components/ui';
import { usePlaceSearch } from '../features/places/usePlaceSearch';
import { safeDetailUrl } from '../services/placeContract';
import { useState } from 'react';

export function generateMetadata() {
  return { title: '병원 · 약국 찾기 | Dr.MAS', description: '현재 위치와 키워드로 병원과 약국을 찾아보세요.' };
}

export default function PlacesScreen() {
  const router = useRouter(), search = usePlaceSearch();
  const [linkError, setLinkError] = useState<string | null>(null);
  async function openDetail(url: string) {
    setLinkError(null);
    try { await Linking.openURL(safeDetailUrl(url)); } catch { setLinkError('장소 상세 페이지를 열지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  }
  return <SafeAreaView style={s.root} edges={['top', 'bottom']}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" style={s.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={s.backText}>‹ 돌아가기</Text></Pressable>
      <Text style={s.h1}>병원 · 약국 찾기</Text>
      <Text style={[s.paragraph, { marginVertical: 12 }]}>로그인 없이 지역명이나 기관명으로 검색할 수 있어요. 주변 검색은 현재 위치를 사용합니다.</Text>
      <View style={[s.row, { gap: 10, marginBottom: 15 }]}>{(['hospital', 'pharmacy'] as const).map(category => <Pressable key={category} accessibilityRole="radio" accessibilityState={{ checked: search.category === category }} onPress={() => search.chooseCategory(category)} style={[s.delayChip, search.category === category && s.delaySelected]}>
        <Text style={{ color: search.category === category ? C.white : C.ink, fontWeight: '700' }}>{category === 'hospital' ? '병원' : '약국'}</Text>
      </Pressable>)}</View>
      <Panel>
        <Field label="지역명 · 기관명" accessibilityLabel="검색할 지역명 또는 기관명" value={search.keyword} onChangeText={search.changeKeyword} maxLength={80} placeholder="지역명 또는 기관명 입력" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => { void search.run('keyword'); }} />
        <Action label="키워드 검색" disabled={search.loading} onPress={() => { void search.run('keyword'); }} />
        <View style={{ height: 10 }} /><Action label="현재 위치로 주변 3km 검색" outline disabled={search.loading} onPress={() => { void search.run('nearby'); }} />
        <Text style={[s.caption, { marginTop: 10 }]}>위치 권한을 허용하지 않아도 키워드 검색은 이용할 수 있습니다. 위치와 검색어는 기기에 저장하지 않습니다.</Text>
      </Panel>
      {search.loading && <View style={[s.row, { gap: 10, marginVertical: 15 }]}><ActivityIndicator color={C.blue} /><Text accessibilityLiveRegion="polite" style={s.paragraph}>검색 정보를 확인하고 있습니다.</Text></View>}
      {search.error && <Text accessibilityRole="alert" style={[s.paragraph, { color: C.danger, marginVertical: 15 }]}>{search.error}</Text>}
      {linkError && <Text accessibilityRole="alert" style={[s.paragraph, { color: C.danger }]}>{linkError}</Text>}
      {search.searched && !search.loading && !search.error && search.places.length === 0 && <Text style={[s.paragraph, { marginVertical: 18 }]}>검색 결과가 없습니다. 다른 지역명이나 기관명으로 검색해 주세요.</Text>}
      {search.places.map(place => <Pressable key={place.id} accessibilityRole="link" accessibilityLabel={`${place.name}, 카카오맵 상세 보기`} onPress={() => { void openDetail(place.detailUrl); }} style={({ pressed }) => [s.serviceCard, { marginTop: 12, opacity: pressed ? .75 : 1 }]}>
        <View style={s.flex}><Text style={s.bodyStrong}>{place.name}</Text><Text style={s.caption}>{place.category}</Text>
          <Text style={[s.paragraph, { marginTop: 6 }]}>{place.roadAddress || place.address || '주소 정보 없음'}</Text>
          <Text style={s.caption}>{place.phone || '전화번호 정보 없음'}{place.distanceMeters !== null ? ` · ${place.distanceMeters < 1000 ? `${Math.round(place.distanceMeters)}m` : `${(place.distanceMeters / 1000).toFixed(1)}km`}` : ''}</Text>
          <Text style={[s.link, { marginTop: 7 }]}>카카오맵에서 상세 보기 ↗</Text>
        </View>
      </Pressable>)}
      {search.searched && !search.isEnd && <Action label="결과 더 보기" outline disabled={search.loading} onPress={() => { void search.run('more'); }} />}
      <View style={[s.alertSoft, { marginVertical: 20 }]}><Text style={s.alertSoftText}>검색 정보 제공: 카카오맵. 기관의 의료적 품질이나 실시간 영업·진료 여부를 보증하지 않습니다. 방문 전 기관에 확인해 주세요. 응급실 가용 정보가 아니며 응급 상황에서는 119에 연락하세요.</Text></View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
