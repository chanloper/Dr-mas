import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Action, Panel, s } from '../components/ui';
import { inspectAndroidNotifications, notificationDiagnosticsEnabled, type NotificationReadiness } from './androidNotificationReadiness';

export function DevNotificationsPanel() {
  if (!notificationDiagnosticsEnabled()) return null;
  return <NotificationStatus />;
}
function NotificationStatus() {
  const [status, setStatus] = useState<NotificationReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(false), locked = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function inspect() {
    if (!notificationDiagnosticsEnabled() || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const value = await inspectAndroidNotifications({ enabled: notificationDiagnosticsEnabled(), platform: Platform.OS,
        expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient, physicalDevice: Device.isDevice,
        androidPackage: Constants.expoConfig?.android?.package,
        projectId: Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId,
        fcmFileConfigured: !!Constants.expoConfig?.android?.googleServicesFile,
      }, async () => {
        // Do not import the remote-notification module in Expo Go or on web.
        const notifications = await import('expo-notifications');
        return notifications.getPermissionsAsync();
      });
      if (live.current && notificationDiagnosticsEnabled()) setStatus(value);
    } finally { locked.current = false; if (live.current) setBusy(false); }
  }
  return <View style={s.sectionGap}><Panel>
    <Text style={s.sectionTitle}>알림 수신 준비 확인</Text>
    <Text style={s.caption}>개발 전용 · 권한 상태만 읽습니다. 권한 요청·토큰 발급·서버 등록·알림 발송은 하지 않습니다.</Text>
    <Action label={busy ? '확인 중…' : 'Android 알림 상태 확인'} outline disabled={busy} onPress={() => { void inspect(); }} />
    {status && <>
      <Text style={s.caption}>실행 환경: {status.runtime}</Text>
      <Text style={s.caption}>패키지명: {status.packageConfigured ? '설정됨' : '미확정'} · EAS 프로젝트: {status.projectConfigured ? '설정됨' : '미확정'}</Text>
      <Text style={s.caption}>FCM 파일 경로: {status.fcmFileConfigured ? '설정됨 · 유효성 미검증' : '미설정'}</Text>
      <Text style={s.caption}>알림 권한: {status.permission} · 재요청 가능: {status.canAskAgain === null ? '미확인' : status.canAskAgain ? '예' : '아니오'}</Text>
      <Text style={s.caption}>토큰 발급: 미실행 · 사용자별 서버 등록: 미구현</Text>
    </>}
  </Panel></View>;
}
