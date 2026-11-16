import { useRef } from 'react';
import { Text, View } from 'react-native';
import { normalizeSosDelay, sosDelayAtPosition } from '../services/sosDelay';
import { Action, C, s } from './ui';

export function SosDelaySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const width = useRef(1), origin = useRef(0);
  const current = normalizeSosDelay(value);
  return <View style={{ gap: 8 }}>
    <Text style={s.bodyStrong}>선택한 대기시간: {current}초</Text>
    <View accessible accessibilityRole="adjustable" accessibilityLabel="SOS 대기시간"
      accessibilityValue={{ min: 10, max: 60, now: current, text: `${current}초` }}
      accessibilityActions={[{ name: 'increment', label: '1초 늘리기' }, { name: 'decrement', label: '1초 줄이기' }]}
      onAccessibilityAction={event => onChange(normalizeSosDelay(current + (event.nativeEvent.actionName === 'increment' ? 1 : -1)))}
      onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width - 28); }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={event => {
        origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX + 14;
        onChange(sosDelayAtPosition(event.nativeEvent.pageX - origin.current, width.current));
      }}
      onResponderMove={event => onChange(sosDelayAtPosition(event.nativeEvent.pageX - origin.current, width.current))}
      onResponderTerminationRequest={() => false}
      style={{ height: 52, justifyContent: 'center', paddingHorizontal: 14 }}>
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: C.line }}>
        <View style={{ height: 6, borderRadius: 3, width: `${(current - 10) * 2}%`, backgroundColor: C.blue }} />
        <View style={{ position: 'absolute', left: `${(current - 10) * 2}%`, marginLeft: -14, top: -11, height: 28, width: 28, borderRadius: 14, backgroundColor: C.blue }} />
      </View>
    </View>
    <View style={s.rowBetween}><Text style={s.caption}>10초</Text><Text style={s.caption}>60초 · 1초 단위</Text></View>
    <View style={{ gap: 8 }}><Action small outline label="1초 줄이기" disabled={current <= 10} onPress={() => onChange(current - 1)} /><Action small outline label="1초 늘리기" disabled={current >= 60} onPress={() => onChange(current + 1)} /></View>
    <Text style={s.caption}>현재 로그인 동안 유지됩니다. 로그아웃하거나 앱을 다시 시작하면 10초로 초기화됩니다. 조절만으로 SOS가 발송되지는 않습니다.</Text>
  </View>;
}
