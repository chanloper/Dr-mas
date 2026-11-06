import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { placePhoneUrl, requestPlaceDialer } from '../services/placePhone';
import type { Place } from '../services/placesClient';
import { FeatureModal } from './FeatureModal';
import { Action, Chip, StatusMessage, s } from './ui';

function InstitutionPhone({ phone }: { phone: string }) {
  const [phoneNotice, setPhoneNotice] = useState(''), [calling, setCalling] = useState(false);
  const active = useRef(true), locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function openPhone() {
    if (!active.current || locked.current) return;
    locked.current = true; setCalling(true);
    try {
      const opened = await requestPlaceDialer(phone, url => Linking.openURL(url));
      if (active.current) setPhoneNotice(opened ? '전화 앱 열기를 요청했습니다. 실제 통화는 전화 앱에서 직접 진행하세요. 앱이 열리지 않으면 표시된 번호를 직접 입력해 주세요.' : '전화 앱을 열지 못했습니다. 휴대전화에서 표시된 기관 번호를 직접 입력해 주세요.');
    } finally { locked.current = false; if (active.current) setCalling(false); }
  }
  return <>
    <Action label={calling ? '전화 앱 연결 요청 중…' : '기관 전화 앱 열기'} outline disabled={calling || !placePhoneUrl(phone)} onPress={() => { void openPhone(); }} />
    {!placePhoneUrl(phone) && <Text style={s.caption}>사용 가능한 전화번호가 제공되지 않아 전화 연결을 사용할 수 없습니다.</Text>}
    {!!phoneNotice && <StatusMessage>{phoneNotice}</StatusMessage>}
  </>;
}
export function PlaceDetailsModal({ place, visible = place !== null, onClose, onOpenMap }: { place: Place | null; visible?: boolean; onClose: () => void; onOpenMap: (url: string) => void }) {
  return <FeatureModal visible={visible} title="병원·약국 상세" onClose={onClose}>
    {!place && <><StatusMessage kind="empty">선택한 기관이 없습니다. 검색 결과를 선택하면 실제 제공된 기관 정보를 표시합니다.</StatusMessage>{['기관명·분류', '도로명·지번 주소', '전화번호', '검색 위치 기준 거리'].map(label => <View key={label} style={s.listItem}><Text style={s.bodyStrong}>{label}</Text><Text style={s.caption}>정보 없음</Text></View>)}<Text style={s.caption}>진료 중·24시간 운영 여부는 검증된 데이터가 없으므로 표시하지 않습니다.</Text></>}
    {place && <>
      <Text style={s.sectionTitle}>{place.name}</Text><Chip text={place.category} kind="neutral" />
      <View style={s.listItem}><Text style={s.bodyStrong}>주소</Text><Text selectable style={s.paragraph}>{place.roadAddress || place.address || '제공된 주소 없음'}</Text></View>
      <View style={s.listItem}><Text style={s.bodyStrong}>전화번호</Text><Text selectable style={s.paragraph}>{place.phone || '제공된 전화번호 없음'}</Text></View>
      {visible && <InstitutionPhone key={place.id} phone={place.phone} />}
      <View style={s.listItem}><Text style={s.bodyStrong}>거리</Text><Text style={s.paragraph}>{place.distanceMeters === null ? '현재 위치 기준 거리 없음' : `${Math.round(place.distanceMeters)}m · 검색 시점 기준`}</Text></View>
      <StatusMessage>진료 중·24시간 운영·응급실 수용 여부는 확인되지 않았습니다. 방문 전 기관에 직접 확인해 주세요.</StatusMessage>
      <Text style={s.caption}>정보 제공: 카카오맵. 검색 결과에 포함된 정보만 표시합니다.</Text>
      <Action label="카카오맵에서 상세 보기 ↗" outline onPress={() => onOpenMap(place.detailUrl)} />
    </>}
  </FeatureModal>;
}
