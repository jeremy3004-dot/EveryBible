import type { Session } from '@supabase/supabase-js';
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
// Keep ownership after the code is consumed, so duplicate deliveries cannot
// remount an active form and interrupt its recovery session.
let activePasswordRecovery: PendingPasswordRecovery | null = null;
let recoveryActivationStarted = false;

export function getPendingPasswordRecovery(): PendingPasswordRecovery | null {
  return pendingPasswordRecovery;
}

export function clearPendingPasswordRecovery(owner?: PendingPasswordRecovery | null): void {
  if (owner !== undefined && owner !== activePasswordRecovery) return;
  pendingPasswordRecovery = null;
  activePasswordRecovery = null;
  recoveryActivationStarted = false;
}

export type ActivateRecoverySessionResult =
  | { status: 'activated' }
  | { status: 'missing' }
  | { status: 'failed'; problem: RecoveryProblem };

export interface ActivatePasswordRecoveryOptions {
  /** The account signed in on this device when the user confirmed, if any. */
  signedInUserId?: string | null;
  /** Clears the current account while keeping the isolated recovery route mounted. */
  signOutCurrentAccount?: () => Promise<void>;
  /** Observes the exact session returned by this validated recovery exchange. */
  onActivated?: (session: Session) => void;
}

// auth-js keeps the PKCE verifier in the client's storage under `<storageKey>-code-verifier`.
// Neither is public API; passwordRecoveryPkce.realClient.behavior.test.ts pins this against
// the installed auth-js.
interface AuthStorageInternals {
  storage: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
  };
  storageKey: string;
}

async function readStoredCodeVerifier(): Promise<{
  isRecovery: boolean;
  restore: () => Promise<void>;
} | null> {
  const auth = supabase.auth as unknown as AuthStorageInternals;
  const key = `${auth.storageKey}-code-verifier`;
  let value: string | null = null;
  try {
    value = await auth.storage.getItem(key);
  } catch {
    value = null;
  }
  if (!value) return null;
  const stored = value;
  let isRecovery = false;
  try {
    // getItemAsync in auth-js decodes storage before splitting this same tag.
    const decoded: unknown = JSON.parse(stored);
    if (typeof decoded === 'string') {
      const [verifier, redirectType] = decoded.split('/');
      isRecovery = Boolean(verifier) && redirectType === 'PASSWORD_RECOVERY';
    }
  } catch {
    // Malformed SDK storage cannot authorize a recovery exchange.
  }
  return {
    isRecovery,
    restore: async () => {
      await auth.storage.setItem(key, stored);
    },
  };
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
 * the user confirms. If that sign-out fails the code is not exchanged, and when this
 * install holds no verifier (a link it never requested) nobody is signed out.
 */
export async function activatePendingPasswordRecovery(
  options: ActivatePasswordRecoveryOptions = {}
): Promise<ActivateRecoverySessionResult> {
  const pending = pendingPasswordRecovery;
  if (!pending || pending.kind !== 'code') {
    return { status: 'missing' };
  }
  recoveryActivationStarted = true;

  if (!isSupabaseConfigured()) {
    return { status: 'failed', problem: 'configuration' };
  }

  const verifier = await readStoredCodeVerifier();
  if (!verifier || !verifier.isRecovery) {
    pendingPasswordRecovery = null;
    return { status: 'failed', problem: verifier ? 'expired' : 'wrong-device' };
  }
  if (options.signedInUserId && options.signOutCurrentAccount) {
    // auth-js deletes the verifier on sign-out; restore only the validated
    // recovery verifier before exchanging this device's parked code.
    try {
      await options.signOutCurrentAccount();
      await verifier.restore();
    } catch {
      return { status: 'failed', problem: 'network' };
    }
  }

  pendingPasswordRecovery = null;

  let observed: Session | null = null;
  let admitted: Session | null = null;
  let revision = 0;
  let admittedRevision = 0;
  let release = () => {};
  const sameSession = (left: Session | null, right: Session | null) =>
    left?.user.id === right?.user.id &&
    left?.access_token === right?.access_token &&
    left?.refresh_token === right?.refresh_token;
  try {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        if (!sameSession(observed, session)) {
          revision += 1;
          admitted = session;
          admittedRevision = revision;
        }
        observed = session;
      } else if (event === 'TOKEN_REFRESHED') {
        if (observed?.user.id !== session?.user.id) {
          revision += 1;
          admitted = null;
        }
        observed = session;
      } else if (event === 'SIGNED_OUT') {
        revision += 1;
        admitted = null;
        observed = null;
      }
    });
    release = () => subscription.unsubscribe();
    const { data, error } = await supabase.auth.exchangeCodeForSession(pending.code);

    if (error || !data.session) {
      return { status: 'failed', problem: classifyRecoveryExchangeError(error) };
    }

    // auth-js tags the stored verifier with the request that created it. Only a
    // verifier stored by resetPasswordForEmail may open the new-password form.
    // (auth-js returns `redirectType` at runtime but its published type omits it.)
    const { redirectType } = data as { redirectType?: string | null };
    if (redirectType !== 'PASSWORD_RECOVERY') {
      // A later verifier write can still change the SDK tag after preflight.
      // Keep its defense scoped to the exchange session, including across native
      // removal. Refresh/duplicate SIGNED_IN retain the initial admission identity.
      const ownsExchange = sameSession(admitted, data.session) && admittedRevision === revision;
      const cleanupRevision = revision;
      const isCurrent = () =>
        ownsExchange && revision === cleanupRevision && observed?.user.id === data.session?.user.id;
      if (isCurrent()) {
        await import('./authService')
          .then(({ signOut }) => signOut(isCurrent))
          .catch(() => undefined);
      }
      return { status: 'failed', problem: 'expired' };
    }
    options.onActivated?.(data.session);
  } catch (e) {
    return { status: 'failed', problem: classifyRecoveryExchangeError(e) };
  } finally {
    release();
  }

  return { status: 'activated' };
}

function performResetPasswordNavigation(): void {
  // Recovery may replace the account. Discard all prior route keys and screen-local
  // data before confirmation, with a fresh More screen underneath for dismissal.
  rootNavigationRef.resetRoot({
    index: 0,
    routes: [
      {
        name: 'More',
        state: {
          index: 1,
          routes: [
            { name: 'MoreScreen' },
            {
              name: 'Auth',
              state: { index: 0, routes: [{ name: 'ResetPassword' }] },
            },
          ],
        },
      },
    ],
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

  if (
    activePasswordRecovery &&
    (recoveryActivationStarted ||
      (activePasswordRecovery.kind === 'code' &&
        parsed.kind === 'code' &&
        activePasswordRecovery.code === parsed.code) ||
      (activePasswordRecovery.kind === 'unusable' &&
        parsed.kind === 'unusable' &&
        activePasswordRecovery.reason === parsed.reason))
  ) {
    // A different link may replace an unconfirmed one, but once activation has
    // started the user finishes or closes that flow before opening another.
    // A duplicate delivered as navigation becomes ready consumes its queued reset.
    flushPendingResetPasswordNavigation();
    return true;
  }

  pendingPasswordRecovery = parsed;
  activePasswordRecovery = parsed;
  recoveryActivationStarted = false;
  navigateToResetPassword();
  return true;
}
