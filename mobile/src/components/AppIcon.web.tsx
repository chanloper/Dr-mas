import { designTokens } from './designTokens';

// Font-independent web artwork. Native platforms keep expo-symbols unchanged.
const paths: Record<string, string> = {
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l6 6',
  menu: 'M3 5h18M3 12h18M3 19h18',
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  medication: 'M9 3h6M8 6h8a2 2 0 0 1 2 2v12H6V8a2 2 0 0 1 2-2ZM12 10v6M9 13h6',
  assistant: 'M4 4h16v13H9l-5 4ZM8 9h8M8 13h5',
  services: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  settings: 'm10 3 4 0 1 3 3 1 3 3-2 3 0 4-3 1-2 3-4 0-1-3-3-1-1-4 2-3 0-4 3-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  prescription: 'M6 3h9l4 4v14H5V3ZM14 3v5h5M8 12h8M8 16h6',
  places: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  health: 'M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-4 4 1 10 8 15 7-5 12-11 8-15Z',
  family: 'M11 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 21v-4c0-5 12-5 12 0v4ZM16 14c4 0 6 1 6 4v3h-5',
  sos: 'M12 3 1 21h22ZM12 9v5M12 17v1',
  call: 'm6 3 4 5-3 3c1 3 3 5 6 6l3-3 5 4c-1 5-5 5-10 2S1 10 3 5Z',
  chevronDown: 'm5 8 7 7 7-7', chevronUp: 'm5 16 7-7 7 7',
  pulse: 'M2 12h5l3-7 4 14 3-7h5',
  sleep: 'M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z',
};
const aliases: Record<string, string> = { '⌂': 'home', '◷': 'medication', '✧': 'assistant', '✦': 'assistant', '▦': 'services', '⚙': 'settings', '▤': 'prescription', '⌖': 'places', '♡': 'health', '♧': 'family', '⚠': 'sos' };
export function AppIcon({ name, size = 22, color = designTokens.colors.primary }: { name: string; size?: number; color?: string }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={paths[aliases[name] ?? name] ?? 'M9 7a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 17v1'} />
  </svg>;
}
