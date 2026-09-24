import type { AuthErrorCode } from '../../../services/auth/authErrors';
import type { ActivateRecoverySessionResult } from '../../../services/auth/authDeepLink';
import {
  recoveryProblemMessageKey,
  type RecoveryProblem,
} from '../../../services/auth/authRecoveryLink';
import { passwordErrorKey } from '../authScreenParts/authFormModel';

// The screen is only reachable from a password-reset deep link. The link's PKCE
// code is parked (never exchanged) until the user confirms here — see
// ../../../services/auth/authDeepLink.ts. A link that cannot be used (an old
// implicit-flow link, an expired one, or one opened on another device) lands in
// the 'problem' phase, which explains why and can send a fresh link.
export type ResetPhase = 'confirm' | 'form' | 'problem';

/** Translation keys for the new-password fields that failed validation. */
export interface NewPasswordErrors {
  password?: string;
  confirmPassword?: string;
}

/** Only a parked PKCE code can be confirmed; anything else is already a problem. */
export function initialResetPhase(pending: { kind: string } | null): ResetPhase {
  return pending?.kind === 'code' ? 'confirm' : 'problem';
}

/** Why an activation left no recovery session; null when it opened one. */
export function activationProblem(result: ActivateRecoverySessionResult): RecoveryProblem | null {
  if (result.status === 'activated') return null;
  return result.status === 'failed' ? result.problem : 'expired';
}

/** Without a backend a new link cannot be sent either. */
export function canRequestNewLink(problem: RecoveryProblem): boolean {
  return problem !== 'configuration';
}

export function validateNewPassword(password: string, confirmPassword: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  const passwordError = passwordErrorKey(password);
  if (passwordError) errors.password = passwordError;
  if (confirmPassword !== password) errors.confirmPassword = 'auth.passwordsDoNotMatch';
  return errors;
}

/**
 * A refused password update's message. `result.error` is raw, untranslated English
 * and is never shown. No active or valid recovery session (an expired or already-used
 * link) also lands on the last case, since Supabase reports it as a generic auth error.
 */
export function resetFailureMessageKey(code: AuthErrorCode | undefined): string {
  if (code === 'service_unavailable') return 'auth.serviceUnavailable';
  if (code === 'configuration') return 'auth.backendNotConfigured';
  return 'auth.resetPasswordInvalidSession';
}

export interface ResetStepCopy {
  titleKey: string;
  subtitleKey: string;
  /** The problem step's reason is announced when it appears. */
  liveSubtitle: boolean;
}

/** Each step's title and the line under it. */
export function resetStepCopy(
  phase: ResetPhase,
  problem: RecoveryProblem,
  isSignedIn: boolean
): ResetStepCopy {
  if (phase === 'problem') {
    return {
      titleKey: 'auth.resetPasswordTitle',
      subtitleKey: recoveryProblemMessageKey(problem),
      liveSubtitle: true,
    };
  }
  if (phase === 'confirm') {
    return {
      titleKey: 'auth.resetLinkConfirmTitle',
      subtitleKey: isSignedIn ? 'auth.resetLinkSignsOutCurrent' : 'auth.resetPasswordSubtitle',
      liveSubtitle: false,
    };
  }
  return {
    titleKey: 'auth.resetPasswordTitle',
    subtitleKey: 'auth.resetPasswordSubtitle',
    liveSubtitle: false,
  };
}
