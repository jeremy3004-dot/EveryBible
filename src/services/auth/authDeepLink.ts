import { supabase, isSupabaseConfigured } from '../supabase';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import {
  classifyRecoveryExchangeError,
  parseRecoveryLink,
  type RecoveryLinkParseResult,
  type RecoveryProblem,
} from './authRecoveryLink';

// When a reset-password link is opened before the NavigationContainer is ready
// (cold start, or a not-yet-onboarded install), navigating would be a silent
// no-op. We remember the pending intent and flush it once navigation is ready.
let hasPendingResetPasswordNavigation = false;

export type PendingPasswordRecovery = RecoveryLinkParseResult;

// The link is parked here rather than exchanged on arrival. The same URL can be
// delivered twice (cold-start URL plus the url event, handled by both App.tsx
// and AppRuntimeEffects), and auth-js deletes the code verifier after the first
// exchange attempt, so exchanging on arrival could race itself into a failure.
// ResetPasswordScreen exchanges the code once the user taps Continue.
let pendingPasswordRecovery: PendingPasswordRecovery | null = null;

export function getPendingPasswordRecovery(): PendingPasswordRecovery | null {
  return pendingPasswordRecovery;
}

export function clearPendingPasswordRecovery(): void {
  pendingPasswordRecovery = null;
}

export type ActivateRecoverySessionResult =
  | { status: 'activated' }
  | { status: 'missing' }
  | { status: 'failed'; problem: RecoveryProblem };

/**
 * Exchanges the parked PKCE code for a recovery session. Called ONLY after the
 * user has explicitly confirmed the reset on ResetPasswordScreen. auth-js
 * consumes the stored code verifier on every attempt, so the parked code is
 * dropped whether or not the exchange succeeds.
 */
export async function activatePendingPasswordRecovery(): Promise<ActivateRecoverySessionResult> {
  const pending = pendingPasswordRecovery;
  if (!pending || pending.kind !== 'code') {
    return { status: 'missing' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'failed', problem: 'configuration' };
  }

  pendingPasswordRecovery = null;

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(pending.code);

    if (error || !data.session) {
      return { status: 'failed', problem: classifyRecoveryExchangeError(error) };
    }

    // auth-js tags the stored verifier with the request that created it. Only a
    // verifier stored by resetPasswordForEmail may open the new-password form.
    // (auth-js returns `redirectType` at runtime but its published type omits it.)
    const { redirectType } = data as { redirectType?: string | null };
    if (redirectType !== 'PASSWORD_RECOVERY') {
      await supabase.auth.signOut().catch(() => undefined);
      return { status: 'failed', problem: 'expired' };
    }
  } catch (e) {
    return { status: 'failed', problem: classifyRecoveryExchangeError(e) };
  }

  return { status: 'activated' };
}

function performResetPasswordNavigation(): void {
  rootNavigationRef.navigate('More', {
    screen: 'Auth',
    params: {
      screen: 'ResetPassword',
    },
  });
}

function navigateToResetPassword(): void {
  if (rootNavigationRef.isReady()) {
    performResetPasswordNavigation();
    return;
  }
  hasPendingResetPasswordNavigation = true;
}

// Called from the NavigationContainer onReady handler so a reset link that
// arrived during boot is honored the moment navigation becomes usable.
export function flushPendingResetPasswordNavigation(): void {
  if (!hasPendingResetPasswordNavigation || !rootNavigationRef.isReady()) {
    return;
  }
  hasPendingResetPasswordNavigation = false;
  performResetPasswordNavigation();
}

// Entry point for both cold-start (Linking.getInitialURL) and warm (Linking 'url' event)
// password-reset deep links. Deliberately does NOT establish a session: it validates the
// URL against the app's own reset link, parks the code (or the reason the link cannot be
// used), and navigates to ResetPasswordScreen, which either explains the problem or asks
// the user to continue before the code is exchanged.
export async function handleAuthDeepLinkUrl(url: string): Promise<boolean> {
  const parsed = parseRecoveryLink(url);
  if (!parsed || !isSupabaseConfigured()) {
    return false;
  }

  pendingPasswordRecovery = parsed;
  navigateToResetPassword();
  return true;
}
