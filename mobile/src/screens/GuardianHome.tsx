import React from 'react';
import { Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, Chip, Panel, SummaryTile, TitleRow, s } from '../components/ui';

export default function GuardianHome() {
  const { sosNotice, sosAcknowledged, setSosAcknowledged, startSOS, setTab } = useDrMAS();
  return <>
    <View style={s.greeting}><View style={s.flex}><Text style={s.overline}>FAMILY CARE DASHBOARD</Text><Text style={s.h1}>가족의 안심을 함께 ♡</Text><Text style={[s.paragraph, { marginTop: 5 }]}>오늘의 가족 건강을 한눈에 확인해요.</Text></View></View>
    <View style={[s.hero, { backgroundColor: '#087D70' }]}>
      <View style={s.rowBetween}><Text style={s.heroTag}>FAMILY CONNECTION</Text><Chip text="동의 기반 연결" kind="neutral" /></View>
      <Text style={s.heroTitle}>가족의 건강을{ '\n' }따뜻하게 지켜주세요.</Text>
      <Text style={s.heroDesc}>설정의 연결 관리에서 환자의 승인을 요청하고 연결 상태를 확인하세요.</Text>
      <View style={[s.heroMetrics, { justifyContent: 'flex-start' }]}><Text style={{ color: C.white, fontWeight: '700', lineHeight: 21 }}>♡ 환자 본인의 승인이 필요해요.{ '\n' }연결 관리에서 승인 상태를 확인하세요.</Text></View>
    </View>
    {sosNotice && !sosAcknowledged && <View style={s.sectionGap}><Panel style={{ borderColor: '#FCA5A5', backgroundColor: '#FFF1F2' }}><Text style={[s.sectionTitle, { color: C.danger }]}>⚠ 기기 내 SOS 알림</Text><Text style={[s.paragraph, { marginVertical: 12 }]}>이 기기에서 생성된 알림 상태입니다. 보호자에게 푸시 알림이 발송된 것은 아닙니다.</Text><Action label="확인 완료" onPress={() => setSosAcknowledged(true)} danger /></Panel></View>}
    <View style={s.sectionGap}><TitleRow title="연결된 가족" accessory="개인정보 보호" /><Panel>
      <View style={s.row}><View style={[s.avatar, { backgroundColor: '#E8F5EE' }]}><Text style={{ fontSize: 24, color: C.green }}>♡</Text></View><View style={s.flex}><Text style={s.bodyStrong}>환자와 연결을 관리하세요</Text><Text style={[s.caption, { marginTop: 4 }]}>승인된 연결과 대기 요청은 설정에서 확인할 수 있습니다.</Text></View></View>
      <View style={{ marginTop: 18 }}><Action label="가족 연결 관리" outline onPress={() => setTab('settings')} /></View>
    </Panel></View>
    <View style={s.sectionGap}><TitleRow title="모니터링 요약" accessory="연동 전" /><View style={s.tileGrid}>
      <SummaryTile title="심박수" value="—" footer="웨어러블 연결 전" />
      <SummaryTile title="복약 상태" value="—" footer="환자 정보 연동 전" />
      <SummaryTile title="최근 위치" value="—" footer="위치 공유 동의 전" />
      <SummaryTile title="SOS 이벤트" value={sosNotice ? '1건' : '0건'} footer="이 기기 내 알림" />
    </View></View>
    <View style={s.sectionGap}><Panel style={{ backgroundColor: '#F4FBF8', borderColor: '#CEEDDE' }}><Text style={[s.sectionTitle, { color: '#076D51' }]}>SOS 알림 확인</Text><Text style={[s.paragraph, { marginVertical: 12 }]}>현재 이 기기에서만 알림 흐름을 확인할 수 있습니다. 다른 기기로 알림을 전송하지 않습니다.</Text><Action label="기기 내 SOS 알림 만들기" onPress={startSOS} /></Panel></View>
  </>;
}
