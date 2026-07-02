import { supabase, isSupabaseConfigured } from '../supabase';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { parseAuthRecoveryTokens } from './authRecoveryLink';

function navigateToResetPassword(): void {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('More', {
      screen: 'Auth',
      params: {
        screen: 'ResetPassword',
      },
    });
  }
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
