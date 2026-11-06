import { Pressable, Text, View } from 'react-native';
import { C, s } from './ui';

export function FeatureTabs({ labels, selected, onSelect }: { labels: string[]; selected: number; onSelect: (index: number) => void }) {
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 }}>
    {labels.map((label, i) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: selected === i }} onPress={() => onSelect(i)}
      style={({ pressed }) => [s.action, { flexGrow: 1, flexBasis: 100, backgroundColor: selected === i ? C.blue : C.white, borderColor: selected === i ? C.blue : C.line, padding: 10, opacity: pressed ? .78 : 1 }]}>
      <Text style={[s.bodyStrong, { textAlign: 'center', color: selected === i ? C.white : C.muted }]}>{label}</Text>
    </Pressable>)}
  </View>;
}
