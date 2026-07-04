import { supabase, isSupabaseConfigured } from '../supabase';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { parseAuthRecoveryTokens } from './authRecoveryLink';

// When a reset-password link is opened before the NavigationContainer is ready
// (cold start, or a not-yet-onboarded install), navigating would be a silent
// no-op. We remember the pending intent and flush it once navigation is ready.
let hasPendingResetPasswordNavigation = false;

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
// password-reset deep links. Establishes the recovery session from the fragment tokens
// and navigates to ResetPasswordScreen, which owns surfacing any session error to the user.
export async function handleAuthDeepLinkUrl(url: string): Promise<boolean> {
  const tokens = parseAuthRecoveryTokens(url);
  if (!tokens || !isSupabaseConfigured()) {
    return false;
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    if (error) {
      console.warn('[Auth] Failed to establish recovery session:', error.message);
    }
  } catch (e) {
    console.warn('[Auth] Failed to establish recovery session:', e);
  }

  navigateToResetPassword();
  return true;
}
