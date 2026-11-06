import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (Object.entries(process.env).some(([name, value]) => name.startsWith('EXPO_PUBLIC_')
    && (/SECRET|PASSWORD|SERVICE_ROLE|OPENAI|KAKAO|TOKEN/.test(name) || /^(sk-|sb_secret_)/.test(value ?? '')))) {
    throw new Error('비밀정보는 공개 앱 환경변수로 설정할 수 없습니다.');
  }
  const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publicKey && !publicKey.startsWith('sb_publishable_')) {
    throw new Error('모바일 설정에는 Supabase publishable 공개 키만 사용할 수 있습니다.');
  }
  const publicUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  // EAS File variables contain a builder-local file path, never JSON contents.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || './google-services.json';
  if (/^[\[{]|[\r\n]/.test(googleServicesFile)) throw new Error('GOOGLE_SERVICES_JSON에는 JSON 내용이 아닌 File 환경변수 경로가 필요합니다.');
  // User-approved Android ID; preserve any existing identity and reject overrides.
  const packageInput = process.env.DRMAS_ANDROID_PACKAGE?.trim();
  const projectInput = process.env.DRMAS_EAS_PROJECT_ID?.trim();
  const existingProject = config.extra?.eas?.projectId as string | undefined;
  const androidPackage = config.android?.package || 'com.drmas.mobile';
  const projectId = existingProject || projectInput;
  if (packageInput && androidPackage !== packageInput
    || existingProject && projectInput && existingProject !== projectInput) throw new Error('기존 앱 식별자와 새 설정이 다릅니다. 기존 연결을 보존하세요.');
  if (androidPackage && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(androidPackage)) throw new Error('Android 패키지명 형식을 확인하세요.');
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('EAS projectId 형식을 확인하세요.');
  if (process.env.EAS_BUILD === 'true' && (!androidPackage || !projectId)) throw new Error('빌드 전 실제 Android 패키지명과 EAS 프로젝트를 확정하세요.');
  const plugins = [...(config.plugins ?? [])];
  if (!plugins.some(p => (Array.isArray(p) ? p[0] : p) === 'expo-image-picker')) plugins.push(['expo-image-picker', {
    cameraPermission: '직접 선택한 처방전 촬영에 카메라를 사용합니다.',
    photosPermission: '직접 선택한 처방전 이미지를 미리보기에 사용합니다.',
    microphonePermission: false,
  }]);
  if (!plugins.some(p => (Array.isArray(p) ? p[0] : p) === 'expo-notifications')) plugins.push(['expo-notifications', { defaultChannel: 'sos' }]);
  // Required by the installed SDK-compatible packages; keep existing options.
  for (const plugin of ['expo-image', 'expo-web-browser']) {
    if (!plugins.some(p => (Array.isArray(p) ? p[0] : p) === plugin)) plugins.push(plugin);
  }
  if (publicUrl) {
    try {
      const url = new URL(publicUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
    } catch {
      throw new Error('Supabase 공개 URL 설정 형식을 확인해 주세요.');
    }
  }
  return {
    ...config,
    name: config.name ?? 'mobile',
    slug: config.slug ?? 'mobile',
    plugins,
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
      googleServicesFile,
    },
    // Existing SSR remains the default. The Vercel build explicitly selects
    // static output so dist is actually a static artifact, not an SSR server.
    web: { ...config.web, ...(process.env.DRMAS_WEB_OUTPUT === 'static' ? { output: 'static' as const } : {}) },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
      environment: {
        name: process.env.EXPO_PUBLIC_APP_ENV?.trim(),
        expectedSupabaseRef: process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF?.trim(),
      },
      placesFunctionUrl: process.env.EXPO_PUBLIC_PLACES_FUNCTION_URL?.trim(),
      // These two values are PUBLIC client configuration, never server secrets.
      // Keep the explicit allowlist: do not spread process.env into the manifest.
      supabase: {
        url: publicUrl,
        publishableKey: publicKey,
      },
    },
  };
}
