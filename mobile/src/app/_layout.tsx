import { Stack } from 'expo-router';
import { rlsDiagnosticsEnabled } from '../dev/rlsDiagnostics';
export const unstable_settings = { initialRouteName: 'index' };

// Screens are split into src/screens; index keeps the current in-app navigation.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={rlsDiagnosticsEnabled()}>
      <Stack.Screen name="_dev/rls-check" />
    </Stack.Protected>
  </Stack>;
}
