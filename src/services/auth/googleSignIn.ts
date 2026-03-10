export interface GoogleSignInEnvironment {
  [key: string]: string | undefined;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
}

export interface GoogleSignInConfig {
  iosClientId?: string;
  webClientId?: string;
}

export function resolveGoogleSignInConfig(
  env: GoogleSignInEnvironment
): GoogleSignInConfig | null {
  const iosClientId = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined;
  const webClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined;

  if (!iosClientId && !webClientId) {
    return null;
  }

  return {
    iosClientId,
    webClientId,
  };
}

export function createGoogleSignInInitializer({
  env,
  configure,
}: {
  env: GoogleSignInEnvironment;
  configure: (config: GoogleSignInConfig) => void;
}) {
  let isConfigured = false;

  return () => {
    const config = resolveGoogleSignInConfig(env);

    if (!config) {
      return false;
    }

    if (!isConfigured) {
      configure(config);
      isConfigured = true;
    }

    return true;
  };
}
