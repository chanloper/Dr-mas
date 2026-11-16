import { useState } from 'react';
import { DiseaseReferenceCard } from './DiseaseReferenceCard';
import { Linking, Pressable, Text, View } from 'react-native';
import { Action, C, Field, StatusMessage, s } from './ui';
import { useHiraLookup } from '../features/places/useHiraLookup';
import { ragConfigured } from '../services/rag';
import { currentPlaceLocation } from '../services/placeLocation';
import { HiraLookupError } from '../services/hiraClient';

export function HiraReferencePanel({ kind, onChooseName }: { kind: 'disease' | 'hospital'; onChooseName?: (name: string) => void }) {
  const lookup = useHiraLookup();
  const [query, setQuery] = useState(''), [town, setTown] = useState(''), [by, setBy] = useState<'name' | 'code'>('name'), [linkError, setLinkError] = useState(false);
  const configured = ragConfigured(), disease = kind === 'disease';
  const changeQuery = (value: string) => { lookup.reset(); setQuery(value); setLinkError(false); };
  const run = () => { setLinkError(false); void lookup.run(disease ? { kind, query: query.trim(), by, rows: 5 } : { kind, ...(query.trim() ? { name: query.trim() } : {}), ...(town.trim() ? { town: town.trim() } : {}), rows: 5 }); };
  return <View style={{ gap: 10 }}>
    <Text style={s.sectionTitle}>{disease ? '질병 이름으로 찾기' : '공공 병원정보 보조 조회'}</Text>
    <Text style={s.caption}>출처: 건강보험심사평가원(HIRA) · 로그인 후 조회</Text>
    <Text style={s.paragraph}>{disease ? '알고 있는 질병 이름을 찾아보세요. 증상으로 병을 진단하는 기능은 아니에요.' : '신고된 병원 기본정보를 확인해 보세요. 카카오 검색과는 별도의 자료이며 같은 기관이 두 출처에 표시될 수 있어요.'}</Text>
    {disease && <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>{(['name', 'code'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: by === value }} onPress={() => { lookup.reset(); setBy(value); }} style={[s.delayChip, by === value && s.delaySelected]}><Text style={{ color: by === value ? C.white : C.ink }}>{value === 'name' ? '질병명' : '상병코드'}</Text></Pressable>)}</View>}
    <Field label={disease ? by === 'code' ? '상병코드' : '질병명' : '병원명'} value={query} onChangeText={changeQuery} maxLength={60} placeholder={disease ? by === 'code' ? '예: J00' : '정식 질병명 또는 이름 일부' : '병원 이름 입력'} autoCapitalize={by === 'code' && disease ? 'characters' : 'none'} autoCorrect={false} />
    {!disease && <Field label="읍·면·동 (선택)" value={town} maxLength={40} onChangeText={value => { lookup.reset(); setTown(value); }} placeholder="예: 연건동" />}
    <Action label={disease ? '찾아보기' : '공공 병원정보 조회'} outline small onPress={run} disabled={!configured || lookup.loading || (disease ? !query.trim() : query.trim().length < 2 && town.trim().length < 2)} />
    {!disease && <><Action label="현재 위치로 공공병원 조회" outline small disabled={!configured || lookup.loading} onPress={() => {
      void lookup.run(async () => { let coordinates; try { coordinates = await currentPlaceLocation(); } catch { throw new HiraLookupError('LOCATION'); } return { kind: 'hospital', coordinates, rows: 5 }; });
    }} /><Text style={s.caption}>이 버튼을 누르면 위치 권한을 요청하고 현재 좌표를 검색 서버와 HIRA에 전달해요. 위치는 저장하지 않아요. 거리는 좌표 기반 직선거리 참고값이며 받은 페이지 안에서만 정렬해요.</Text></>}
    {!configured && <StatusMessage>공공자료 연결이 준비되지 않았어요.</StatusMessage>}
    {lookup.loading && <><StatusMessage kind="loading">로그인 상태와 공공자료를 확인하고 있어요.</StatusMessage><Action label="공공자료 조회 취소" small outline onPress={lookup.cancel} /></>}
    {lookup.error && <><StatusMessage kind="error">{lookup.error}</StatusMessage><Action label="공공자료 다시 시도" small outline disabled={lookup.loading} onPress={lookup.retry} /></>}
    {!lookup.result && !lookup.loading && !lookup.error && <StatusMessage kind="empty">조건을 입력하고 조회해 주세요. 입력 중에는 검색하지 않아요.</StatusMessage>}
    {lookup.result && <>
      <Text style={s.caption}>HIRA 조회 결과 · 전체 {lookup.result.total}건 중 {lookup.result.items.length}건 표시</Text>
      {!lookup.result.items.length && <StatusMessage kind="empty">조건에 맞는 공공자료가 없어요. 검색어를 바꿔 보세요.</StatusMessage>}
      {lookup.result.items.map(item => 'code' in item
        ? <DiseaseReferenceCard key={item.code} item={item} onChooseName={onChooseName} />
        : <View key={item.id} style={s.listItem}>
          <Text style={s.bodyStrong}>{item.name}</Text>
          <Text style={s.caption}>{item.institutionType || '기관 종별 정보 없음'}</Text><Text selectable style={s.paragraph}>{item.address || '주소 정보 없음'}</Text><Text selectable style={s.caption}>{item.phone || '전화번호 정보 없음'}</Text>
          {item.distanceMeters !== null && <Text style={s.caption}>직선거리 약 {item.distanceMeters}m · 참고값</Text>}
          <Text style={s.caption}>출처 · HIRA</Text>
        </View>)}
      {lookup.result.hasMore && <Action label="공공자료 더 보기" small outline disabled={lookup.loading} onPress={lookup.more} />}
      {lookup.result.truncated && <StatusMessage>조회 범위를 제한했어요. 조건을 좁혀 다시 검색해 주세요.</StatusMessage>}
      <Action label="HIRA 공식 데이터 안내" small outline onPress={() => { setLinkError(false); void Linking.openURL(lookup.result!.source.datasetUrl).catch(() => setLinkError(true)); }} />
      <Text style={s.caption}>{disease ? '명칭·코드 조회 결과는 의료적 근거로 사용하지 않아요. 의료자료 질문을 선택하면 입력창에 이름만 채우며, 자료를 찾지 못할 수도 있어요.' : '운영시간·현재 진료·응급실 수용 여부는 확인되지 않았어요. 방문 전 기관에 확인해 주세요.'}</Text>
    </>}
    {linkError && <StatusMessage kind="error">공식 안내 페이지를 열지 못했어요.</StatusMessage>}
  </View>;
}
