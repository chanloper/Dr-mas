import { Stack } from 'expo-router';

// Screens are split into src/screens; index keeps the current in-app navigation.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
