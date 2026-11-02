import React from 'react';
import { Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, MedicineRow, Panel, TitleRow, s } from '../components/ui';
import { MedicationStatus } from '../components/MedicationStatus';
import { CloudMedicationPanel } from '../components/CloudMedicationPanel';

export default function MedicationScreen() {
  const { medsReady, medsSaving, meds, takenCount, toggleMedication, setTab } = useDrMAS();
    return <><Text style={s.h1}>복약 관리</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 22 }]}>계정에 저장하는 복약 일정과 이 기기의 예시 기록을 구분해 관리하세요.</Text>
      <Panel style={{ backgroundColor: '#E9F8F1', borderColor: '#CEEFDC' }}><View style={s.rowBetween}><View><Text style={s.overline}>이 기기의 예시 기록</Text><Text style={[s.bigValue, { color: C.green }]}>{takenCount} <Text style={s.caption}>/ {meds.length}회</Text></Text></View><Text style={{ fontSize: 35 }}>✓</Text></View><View style={s.progressTrack}><View style={[s.progressFill, { width: `${(meds.length ? takenCount / meds.length * 100 : 0)}%`, backgroundColor: C.green }]} /></View></Panel>
      <CloudMedicationPanel />
      <Text style={[s.sectionTitle, { marginTop: 22 }]}>이 기기의 예시 일정</Text>
      <MedicationStatus />
      <View style={s.sectionGap}><TitleRow title="복약 체크리스트" accessory="항목을 눌러 기록" /><Panel>{meds.map(m => <MedicineRow key={m.id} med={m} disabled={!medsReady || medsSaving} onPress={() => toggleMedication(m.id)} />)}</Panel></View>
      <View style={s.sectionGap}><Panel><Text style={s.bodyStrong}>처방전과 연동하기</Text><Text style={[s.paragraph, { marginTop: 7 }]}>향후 실제 OCR 분석 후 약품명을 확인하고 복용 스케줄을 등록할 수 있도록 연결할 예정입니다.</Text><View style={{ marginTop: 12 }}><Action label="처방전 기능 보기" outline small onPress={() => setTab('services')} /></View></Panel></View>
      <Text style={s.disclaimer}>기기의 예시 체크와 계정에 저장한 일정은 별도로 관리됩니다. 의료진의 실제 복약 지시를 우선하세요.</Text>
    </>;
  }
