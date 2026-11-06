import { Redirect } from 'expo-router';
import { rlsDiagnosticsEnabled } from '../../dev/rlsDiagnostics';
import { RlsDiagnosticsScreen } from '../../dev/RlsDiagnosticsScreen';

export default function RlsCheckRoute() {
  if (!rlsDiagnosticsEnabled()) return <Redirect href="/" />;
  return <RlsDiagnosticsScreen />;
}
