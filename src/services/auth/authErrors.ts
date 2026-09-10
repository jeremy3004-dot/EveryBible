export type AuthErrorCode =
  | 'cancelled'
  | 'configuration'
  | 'provider_unavailable'
  | 'in_progress'
  | 'invalid_credentials'
  | 'service_unavailable'
  | 'unknown';

export interface AuthFailure {
  success: false;
  code: AuthErrorCode;
  error: string;
}

const getErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
  ) {
    return error.message;
  }

  return fallback;
};

const getErrorCode = (error: unknown): string | null => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.length > 0
  ) {
    return error.code;
  }

  return null;
};

const getErrorStatus = (error: unknown): number | null => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    Number.isFinite(error.status)
  ) {
    return error.status;
  }

  return null;
};

export const authFailure = (
  code: AuthErrorCode,
  error: unknown,
  fallback?: string
): AuthFailure => ({
  success: false,
  code,
  error: getErrorMessage(error, fallback),
});

export const configurationAuthError = (
  error: unknown = 'EveryBible backend is not configured for this build yet.'
): AuthFailure =>
  authFailure('configuration', error, 'EveryBible backend is not configured for this build yet.');

export const providerUnavailableAuthError = (error: unknown): AuthFailure =>
  authFailure('provider_unavailable', error);

export const serviceUnavailableAuthError = (error: unknown): AuthFailure =>
  authFailure('service_unavailable', error);

export const unknownAuthError = (error: unknown, fallback?: string): AuthFailure =>
  authFailure('unknown', error, fallback);

export const mapSupabaseAuthError = (error: unknown): AuthFailure => {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error, '').toLowerCase();

  if (status === 400 || status === 401) {
    return authFailure('invalid_credentials', error);
  }

  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network error')
  ) {
    return serviceUnavailableAuthError(
      'EveryBible could not reach the backend right now. Please try again in a moment.'
    );
  }

  return unknownAuthError(error);
};

export const mapProviderIdTokenAuthError = (
  provider: 'apple' | 'google',
  error: unknown
): AuthFailure => {
  const providerName = provider === 'apple' ? 'Apple' : 'Google';
  const status = getErrorStatus(error);
  const message = getErrorMessage(error, '').toLowerCase();

  if (
    status === 400 &&
    (message.includes('provider is not enabled') ||
      message.includes('unsupported provider') ||
      message.includes('oidc provider is not enabled'))
  ) {
    return providerUnavailableAuthError(
      `${providerName} sign in is not enabled on the EveryBible backend yet.`
    );
  }

  if (status === 400 && message.includes('unacceptable audience')) {
    return providerUnavailableAuthError(
      `${providerName} sign in is using the wrong client ID for this build.`
    );
  }

  return mapSupabaseAuthError(error);
};

export const mapAppleAuthError = (error: unknown): AuthFailure => {
  if (getErrorCode(error) === 'ERR_REQUEST_CANCELED') {
    return authFailure('cancelled', error, 'Sign in cancelled');
  }

  return unknownAuthError(error);
};

export const mapGoogleAuthError = (error: unknown): AuthFailure => {
  switch (getErrorCode(error)) {
    case 'SIGN_IN_CANCELLED':
      return authFailure('cancelled', error, 'Google sign in cancelled');
    case 'IN_PROGRESS':
      return authFailure('in_progress', error, 'Sign in already in progress');
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return authFailure('provider_unavailable', error, 'Play services not available');
    // Android status 10. Play Services rejects the sign-in before any account
    // picker appears when the build's package name + signing certificate has no
    // matching Android OAuth client — which is this project's state. Without its
    // own case it fell through to a bare 'unknown' failure with nothing to go on.
    case 'DEVELOPER_ERROR':
      return authFailure(
        'provider_unavailable',
        error,
        'Google sign in is not configured for this Android build (DEVELOPER_ERROR).'
      );
    default:
      return unknownAuthError(error);
  }
};

export const isSilentAuthError = (code?: AuthErrorCode): boolean => code === 'cancelled';
