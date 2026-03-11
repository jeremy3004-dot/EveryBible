export interface GoogleSignInEnvironment {
  [key: string]: string | undefined;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: string;
}

export interface GoogleSignInConfig {
  iosClientId?: string;
  webClientId?: string;
}

export type GoogleSignInAvailability =
  | { available: true; config: GoogleSignInConfig }
  | { available: false; reason: 'missing_client_ids' | 'android_client_id_only' };

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

export function resolveGoogleSignInAvailability(
  env: GoogleSignInEnvironment
): GoogleSignInAvailability {
  const config = resolveGoogleSignInConfig(env);

  if (config) {
    return {
      available: true,
      config,
    };
  }

  if (env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim()) {
    return {
      available: false,
      reason: 'android_client_id_only',
    };
  }

  return {
    available: false,
    reason: 'missing_client_ids',
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
    const availability = resolveGoogleSignInAvailability(env);

    if (!availability.available) {
      return availability;
    }

    if (!isConfigured) {
      configure(availability.config);
      isConfigured = true;
    }

    return { available: true as const };
  };
}
