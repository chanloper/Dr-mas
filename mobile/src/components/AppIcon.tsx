import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

const icons: Record<string, SymbolViewProps['name']> = {
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  menu: { ios: 'line.3.horizontal', android: 'menu', web: 'menu' },
  home: { ios: 'house', android: 'home', web: 'home' },
  medication: { ios: 'pills', android: 'medication', web: 'medication' },
  assistant: { ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' },
  services: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  prescription: { ios: 'doc.text', android: 'description', web: 'description' },
  places: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  health: { ios: 'heart', android: 'favorite', web: 'favorite' },
  family: { ios: 'person.2', android: 'group', web: 'group' },
  sos: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  call: { ios: 'phone.fill', android: 'call', web: 'call' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  chevronUp: { ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' },
  pulse: { ios: 'waveform.path.ecg', android: 'monitor_heart', web: 'monitor_heart' },
  sleep: { ios: 'moon', android: 'bedtime', web: 'bedtime' },
};
const aliases: Record<string, string> = { '⌂': 'home', '◷': 'medication', '✧': 'assistant', '✦': 'assistant', '▦': 'services', '⚙': 'settings', '▤': 'prescription', '⌖': 'places', '♡': 'health', '♧': 'family', '⚠': 'sos' };

export function AppIcon({ name, size = 22, color = '#135FA8' }: { name: string; size?: number; color?: string }) {
  // Header controls must not depend on a symbol font or an unknown-name fallback.
  const resolved = aliases[name] ?? name;
  if (resolved === 'search') return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <View style={{ position: 'absolute', left: size * .08, top: size * .08, width: size * .62, height: size * .62, borderRadius: size, borderWidth: 2, borderColor: color }} />
    <View style={{ position: 'absolute', left: size * .61, top: size * .71, width: size * .36, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>;
  if (resolved === 'menu') return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: size * .15 }}>
    {[0, 1, 2].map(line => <View key={line} style={{ height: 2, width: '100%', borderRadius: 1, backgroundColor: color }} />)}
  </View>;
  const symbol = icons[resolved];
  if (!symbol) return <Text accessible={false} style={{ fontSize: size, color }}>?</Text>;
  return <SymbolView name={symbol} size={size} tintColor={color}
    style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants"
    fallback={<Text style={{ fontSize: size, color }}>+</Text>} />;
}
