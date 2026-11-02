import { Text, View } from 'react-native';
import { useDrMAS } from '../features/app/context';
import { Action, C, s } from './ui';

export function MedicationStatus() {
  const { medsReady, medsSaving, medsError, retryMedications } = useDrMAS();
  if (medsError) return <View style={{ gap: 8, marginVertical: 8 }}>
    <Text accessibilityRole="alert" style={[s.caption, { color: C.danger }]}>{medsError}</Text>
    <Action label="기록 다시 확인" outline small onPress={retryMedications} />
  </View>;
  if (medsSaving || !medsReady) return <Text accessibilityLiveRegion="polite" style={s.caption}>
    {medsSaving ? '복약 기록을 저장하고 있습니다.' : '복약 기록을 불러오고 있습니다.'}
  </Text>;
  return null;
}
