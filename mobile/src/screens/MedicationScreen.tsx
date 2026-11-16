import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, MedicineRow, Panel, TitleRow, s } from '../components/ui';
import { MedicationStatus } from '../components/MedicationStatus';
import { CloudMedicationPanel } from '../components/CloudMedicationPanel';
import { useRouter } from 'expo-router';

export default function MedicationScreen() {
  const { user, medsReady, medsSaving, meds, takenCount, toggleMedication } = useDrMAS();
  const router = useRouter();
  const [showExamples, setShowExamples] = useState(false);
  if (user?.role === 'guardian') return <><Text style={s.h1}>가족 복약 조회</Text><CloudMedicationPanel /></>;
    return <><Text style={s.h1}>복약 관리</Text><Text style={[s.paragraph, { marginTop: 8, marginBottom: 22 }]}>계정에 저장하는 복약 일정과 이 기기의 예시 기록을 구분해 관리하세요.</Text>
      <CloudMedicationPanel />
      <View style={s.sectionGap}><Action label={showExamples ? '기기의 예시 기록 접기' : '기기의 예시 기록 보기'} small outline onPress={() => setShowExamples(value => !value)} /></View>
      {showExamples && <>
      <Panel style={{ backgroundColor: C.sage, borderColor: C.line, marginTop: 24 }}><View style={s.rowBetween}><View><Text style={s.overline}>이 기기의 예시 기록</Text><Text style={[s.bigValue, { color: C.green }]}>{takenCount} <Text style={s.caption}>/ {meds.length}회</Text></Text></View><Text style={{ fontSize: 35 }}>✓</Text></View><View style={s.progressTrack}><View style={[s.progressFill, { width: `${(meds.length ? takenCount / meds.length * 100 : 0)}%`, backgroundColor: C.green }]} /></View></Panel>
      <Text style={[s.sectionTitle, { marginTop: 22 }]}>이 기기의 예시 일정</Text>
      <MedicationStatus />
      <View style={s.sectionGap}><TitleRow title="복약 체크리스트" accessory="항목을 눌러 기록" /><Panel>{meds.map(m => <MedicineRow key={m.id} med={m} disabled={!medsReady || medsSaving} onPress={() => toggleMedication(m.id)} />)}</Panel></View>
      </>}
      <View style={s.sectionGap}><Panel><Text style={s.bodyStrong}>처방전·약품 정보</Text><Text style={[s.caption, { marginTop: 7 }]}>내 사진과 공개 약품 정보를 확인할 수 있어요. 자동 분석·복약 일정 연동은 아직 준비 중이에요.</Text><View style={{ marginTop: 12 }}><Action label="처방전 화면 보기" outline small onPress={() => router.push('/prescription')} /></View></Panel></View>
      <Text style={s.disclaimer}>기기의 예시 체크와 계정에 저장한 일정은 별도로 관리됩니다. 의료진의 실제 복약 지시를 우선하세요.</Text>
    </>;
  }
