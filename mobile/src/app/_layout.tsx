import { Stack } from 'expo-router';

/** Dr.MAS uses its own bottom navigation inside src/app/index.tsx during this UI phase. */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
