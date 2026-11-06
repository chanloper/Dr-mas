export function notificationDiagnosticsEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
    && process.env.EXPO_PUBLIC_APP_ENV === 'development'
    && process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS === '1';
}
export type NotificationReadiness = {
  runtime: 'ANDROID_DEVICE' | 'EXPO_GO_UNSUPPORTED' | 'DEVICE_REQUIRED' | 'ANDROID_ONLY' | 'DEV_ONLY';
  packageConfigured: boolean; projectConfigured: boolean; fcmFileConfigured: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'not_checked' | 'error';
  canAskAgain: boolean | null;
  token: 'NOT_REQUESTED'; serverRegistration: 'NOT_IMPLEMENTED';
};
type Context = { enabled: boolean; platform: string; expoGo: boolean; physicalDevice: boolean; androidPackage?: string; projectId?: string; fcmFileConfigured: boolean };
export async function inspectAndroidNotifications(context: Context, readPermission: () => Promise<{ status: string; canAskAgain: boolean }>): Promise<NotificationReadiness> {
  const runtime = !context.enabled ? 'DEV_ONLY' : context.platform !== 'android' ? 'ANDROID_ONLY'
    : context.expoGo ? 'EXPO_GO_UNSUPPORTED' : !context.physicalDevice ? 'DEVICE_REQUIRED' : 'ANDROID_DEVICE';
  const result: NotificationReadiness = { runtime,
    packageConfigured: !!context.androidPackage && /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(context.androidPackage),
    projectConfigured: !!context.projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.projectId),
    fcmFileConfigured: context.fcmFileConfigured, permission: 'not_checked', canAskAgain: null,
    token: 'NOT_REQUESTED', serverRegistration: 'NOT_IMPLEMENTED' };
  if (runtime !== 'ANDROID_DEVICE') return result;
  try {
    const permission = await readPermission();
    if (!['granted', 'denied', 'undetermined'].includes(permission.status) || typeof permission.canAskAgain !== 'boolean') throw Error();
    result.permission = permission.status as NotificationReadiness['permission'];
    result.canAskAgain = permission.canAskAgain;
  } catch { result.permission = 'error'; }
  return result;
}
