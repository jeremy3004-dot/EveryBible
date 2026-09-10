import { supabase, isSupabaseConfigured } from '../supabase';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { decodeRecoveryTokenClaims, parseAuthRecoveryTokens } from './authRecoveryLink';

// When a reset-password link is opened before the NavigationContainer is ready
// (cold start, or a not-yet-onboarded install), navigating would be a silent
// no-op. We remember the pending intent and flush it once navigation is ready.
let hasPendingResetPasswordNavigation = false;

export interface PendingPasswordRecovery {
  accessToken: string;
  refreshToken: string;
  /** Display-only claim read from the (unverified) access token payload. */
  email: string | null;
  /** Display-only `sub` claim, used to detect a different-account link. */
  subject: string | null;
}

// Tokens are parked here rather than exchanged for a session on arrival. Any app
// on the device can fire our reset URL, so adopting the session before the user
// has confirmed would be session fixation: the victim would silently end up
// inside the attacker's account. ResetPasswordScreen consumes this slot.
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
  | { status: 'configuration' }
  | { status: 'failed'; error: string | null };

/**
 * Exchanges the parked recovery tokens for a real session. Called ONLY after the
 * user has explicitly confirmed the reset on ResetPasswordScreen.
 */
export async function activatePendingPasswordRecovery(): Promise<ActivateRecoverySessionResult> {
  const pending = pendingPasswordRecovery;
  if (!pending) {
    return { status: 'missing' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'configuration' };
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: pending.accessToken,
      refresh_token: pending.refreshToken,
    });

    if (error) {
      return { status: 'failed', error: error.message };
    }
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : null };
  }

  // The tokens are single-use from here on; drop them so a later re-entry into
  // the screen cannot silently re-establish the same recovery session.
  pendingPasswordRecovery = null;
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
// URL against the app's own reset link, parks the tokens, and navigates to
// ResetPasswordScreen, which asks the user to confirm the account before any
// setSession call happens.
export async function handleAuthDeepLinkUrl(url: string): Promise<boolean> {
  const tokens = parseAuthRecoveryTokens(url);
  if (!tokens || !isSupabaseConfigured()) {
    return false;
  }

  const claims = decodeRecoveryTokenClaims(tokens.accessToken);
  pendingPasswordRecovery = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    email: claims.email,
    subject: claims.subject,
  };

  navigateToResetPassword();
  return true;
}
