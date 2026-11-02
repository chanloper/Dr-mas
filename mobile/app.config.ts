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
    // Existing SSR remains the default. The Vercel build explicitly selects
    // static output so dist is actually a static artifact, not an SSR server.
    web: { ...config.web, ...(process.env.DRMAS_WEB_OUTPUT === 'static' ? { output: 'static' as const } : {}) },
    extra: {
      ...config.extra,
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
