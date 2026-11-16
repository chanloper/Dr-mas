import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DiseaseReference } from '../services/hiraClient';
import { Action, C, s } from './ui';

export function DiseaseReferenceCard({ item, onChooseName }: { item: DiseaseReference; onChooseName?: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={[s.listItem, { gap: 12 }]}>
    <Text selectable style={[s.bodyStrong, { fontSize: 20, lineHeight: 30 }]}>{item.name}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`${item.name} 상세 정보 ${expanded ? '접기' : '보기'}`}
      onPress={() => setExpanded(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={[s.paragraph, { color: C.blue }]}>상세 정보 {expanded ? '접기 −' : '보기 +'}</Text>
    </Pressable>
    {expanded && <View style={{ gap: 8 }}>
      <Text selectable style={s.paragraph}>상병코드 {item.code}</Text>
      <Text selectable style={s.paragraph}>영문명 · {item.englishName || '등록된 정보 없음'}</Text>
      <Text style={s.paragraph}>출처 · 건강보험심사평가원(HIRA)</Text>
    </View>}
    {onChooseName && <>
      <Action label="이 질병에 대해 알아보기" outline onPress={() => onChooseName(item.name)} />
      <Text style={s.paragraph}>질문 칸에 이름만 넣어요. 내용을 확인한 뒤 ‘보내기’를 눌러 주세요.</Text>
    </>}
  </View>;
}
