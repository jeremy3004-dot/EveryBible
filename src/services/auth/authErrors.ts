export type AuthErrorCode =
  | 'cancelled'
  | 'configuration'
  | 'provider_unavailable'
  | 'in_progress'
  | 'invalid_credentials'
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
  error: unknown = 'Supabase is not configured'
): AuthFailure => authFailure('configuration', error, 'Supabase is not configured');

export const providerUnavailableAuthError = (error: unknown): AuthFailure =>
  authFailure('provider_unavailable', error);

export const unknownAuthError = (error: unknown, fallback?: string): AuthFailure =>
  authFailure('unknown', error, fallback);

export const mapSupabaseAuthError = (error: unknown): AuthFailure => {
  const status = getErrorStatus(error);

  if (status === 400 || status === 401) {
    return authFailure('invalid_credentials', error);
  }

  return unknownAuthError(error);
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
    default:
      return unknownAuthError(error);
  }
};

export const isSilentAuthError = (code?: AuthErrorCode): boolean => code === 'cancelled';
