import type { AuthErrorCode } from '../../../services/auth/authErrors';
import type { AuthScreenMode } from '../../../navigation/types';

/** The shortest password the auth server accepts; sign-up and reset share it. */
export const MIN_PASSWORD_LENGTH = 6;

/** Translation keys for the fields that failed validation. */
export interface AuthFormErrors {
  email?: string;
  password?: string;
}

/**
 * Addresses are sent trimmed: iOS QuickType appends a space to a suggested address,
 * and the auth server matches the address exactly, so the space fails sign-in.
 */
export function normalizeEmail(email: string): string {
  return email.trim();
}

export function emailErrorKey(email: string): string | undefined {
  const address = normalizeEmail(email);
  if (!address) return 'auth.emailRequired';
  if (!/\S+@\S+\.\S+/.test(address)) return 'auth.emailInvalid';
  return undefined;
}

export function passwordErrorKey(password: string): string | undefined {
  if (!password) return 'auth.passwordRequired';
  if (password.length < MIN_PASSWORD_LENGTH) return 'auth.passwordMinLength';
  return undefined;
}

export function validateAuthForm(email: string, password: string): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const emailError = emailErrorKey(email);
  const passwordError = passwordErrorKey(password);
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function hasFormErrors(errors: object): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}

/**
 * A failed auth call's message. `result.error` is raw, untranslated English from the
 * service layer and is never shown; the code picks a translated message instead.
 */
export function authFailureMessageKey(
  code: AuthErrorCode | undefined,
  fallbackKey: string
): string {
  switch (code) {
    case 'in_progress':
      return 'auth.signInAlreadyInProgress';
    case 'provider_unavailable':
      return 'auth.providerUnavailable';
    case 'service_unavailable':
      return 'auth.serviceUnavailable';
    case 'configuration':
      return 'auth.backendNotConfigured';
    default:
      return fallbackKey;
  }
}

export function authFailureTitleKey(mode: AuthScreenMode): string {
  return mode === 'signUp' ? 'auth.signUpFailed' : 'auth.signInFailed';
}

export function otherAuthMode(mode: AuthScreenMode): AuthScreenMode {
  return mode === 'signIn' ? 'signUp' : 'signIn';
}

export interface AuthModeCopyKeys {
  title: string;
  subtitle: string;
  primaryLabel: string;
  switchLead: string;
  switchAction: string;
  passwordPlaceholder: string;
}

export function authModeCopyKeys(mode: AuthScreenMode): AuthModeCopyKeys {
  if (mode === 'signUp') {
    return {
      title: 'auth.createAnAccount',
      subtitle: 'auth.signUpSubtitle',
      primaryLabel: 'auth.createAccount',
      switchLead: 'auth.alreadyHaveAccount',
      switchAction: 'auth.signIn',
      passwordPlaceholder: 'auth.passwordHint',
    };
  }

  return {
    title: 'auth.welcomeBack',
    subtitle: 'auth.signInSubtitle',
    primaryLabel: 'auth.signIn',
    switchLead: 'auth.newHere',
    switchAction: 'auth.createAnAccount',
    passwordPlaceholder: 'auth.passwordPlaceholder',
  };
}
