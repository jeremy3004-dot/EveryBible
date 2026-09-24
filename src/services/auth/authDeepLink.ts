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

// auth-js keeps the reset request's PKCE code verifier in its own storage and deletes it
// whenever it removes a session, so signing the current account out would leave the parked
// code unredeemable. `storage` and `storageKey` are not public API;
// passwordRecoveryPkce.realClient.behavior.test.ts pins them against the installed auth-js.
// Null when the client does not have that shape: the sign-out then runs as it always did.
async function readStoredCodeVerifier(): Promise<{
  value: string | null;
  restore: () => Promise<void>;
} | null> {
  try {
    const auth = supabase.auth as unknown as {
      storage?: {
        getItem: (key: string) => Promise<string | null> | string | null;
        setItem: (key: string, value: string) => Promise<void> | void;
      };
      storageKey?: string;
    };
    const { storage, storageKey } = auth;
    if (!storage || typeof storageKey !== 'string') {
      return null;
    }
    const key = `${storageKey}-code-verifier`;
    const value = await storage.getItem(key);
    return {
      value,
      restore: async () => {
        if (value === null) return;
        try {
          await storage.setItem(key, value);
        } catch {
          // The exchange then reports the link as unusable on this device.
        }
      },
    };
  } catch {
    return null;
  }
}

export type ActivateRecoverySessionResult =
  | { status: 'activated' }
  | { status: 'missing' }
  | { status: 'failed'; problem: RecoveryProblem };

export interface ActivatePasswordRecoveryOptions {
  /** The account signed in on this device when the user confirmed, if any. */
  signedInUserId?: string | null;
  /** The app's normal sign-out (authStore.signOut). */
  signOutCurrentAccount?: () => Promise<void>;
}

/**
 * Exchanges the parked PKCE code for a recovery session. Called ONLY after the
 * user has explicitly confirmed the reset on ResetPasswordScreen. auth-js
 * consumes the stored code verifier on every attempt, so the parked code is
 * dropped whether or not the exchange succeeds.
 *
 * A PKCE code does not say whose account it opens, and the exchange replaces this
 * device's session. A reset for another account would otherwise swap the signed-in
 * user out from under the app. So a signed-in account is signed out first, through
 * the normal sign-out (push token, per-user stores, private data scope), and the
 * recovered account then arrives as a clean sign-in. The screen says so before
 * the user confirms. If that sign-out fails the code is not exchanged.
 */
export async function activatePendingPasswordRecovery(
  options: ActivatePasswordRecoveryOptions = {}
): Promise<ActivateRecoverySessionResult> {
  const pending = pendingPasswordRecovery;
  if (!pending || pending.kind !== 'code') {
    return { status: 'missing' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'failed', problem: 'configuration' };
  }

  if (options.signedInUserId && options.signOutCurrentAccount) {
    const verifier = await readStoredCodeVerifier();
    if (verifier && verifier.value === null) {
      // The exchange cannot succeed here; do not sign anyone out finding that out.
      pendingPasswordRecovery = null;
      return { status: 'failed', problem: 'wrong-device' };
    }
    try {
      await options.signOutCurrentAccount();
    } catch {
      return { status: 'failed', problem: 'network' };
    } finally {
      // Removing the session also deletes the verifier the exchange below needs.
      await verifier?.restore();
    }
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
