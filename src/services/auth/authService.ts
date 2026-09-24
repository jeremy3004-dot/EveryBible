import { supabase, isSupabaseConfigured } from '../supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import type { User } from '../../types';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import { withPrivacyLockGrace } from '../privacy/privacyLockGrace';
import { createGoogleSignInInitializer } from './googleSignIn';
import { fenceRefreshToken } from '../supabase/authRequestFence';
import {
  isAccessTokenExpired,
  isDeviceOffline,
  mapSupabaseUser,
  readStoredSession,
} from './authSession';
import type { AuthErrorCode } from './authErrors';
import {
  configurationAuthError,
  mapAppleAuthError,
  mapGoogleAuthError,
  mapProviderIdTokenAuthError,
  mapSupabaseAuthError,
  providerUnavailableAuthError,
  serviceUnavailableAuthError,
  unknownAuthError,
} from './authErrors';

export { getCurrentSession, type RestoredAuthSession } from './authSession';

const ensureGoogleSignInConfigured = createGoogleSignInInitializer({
  env: publicRuntimeConfig,
  configure: (config) => {
    GoogleSignin.configure(config);
  },
});

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
  code?: AuthErrorCode;
}

// A nonce pair for OIDC replay hardening: the raw value is sent to the identity
// provider (Supabase) and the SHA-256 hash is embedded in the token request to the
// OAuth provider (Apple), so an identity token minted for someone else's request
// cannot be replayed against us.
//
// This uses expo-crypto rather than WebCrypto: Hermes exposes no `globalThis.crypto`,
// so the previous WebCrypto implementation returned null on every real device and
// Apple Sign-In always ran WITHOUT a nonce — the hardening existed only on paper.
// The nonce is mandatory now: a generation failure aborts sign-in (see signInWithApple)
// instead of silently degrading to a nonce-less request.
const generateNoncePair = async (): Promise<{ raw: string; hashed: string }> => {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  // digestStringAsync defaults to hex output, which is the encoding Apple expects.
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);

  if (!raw || !hashed) {
    throw new Error('Failed to generate a sign-in nonce');
  }

  return { raw, hashed };
};

// Email sign-up
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      return mapSupabaseAuthError(error);
    }

    if (data.user) {
      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Sign up failed');
  } catch (e) {
    return unknownAuthError(e);
  }
};

// Email sign-in
export const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return mapSupabaseAuthError(error);
    }

    if (data.user) {
      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Sign in failed');
  } catch (e) {
    return unknownAuthError(e);
  }
};

// Apple Sign-In (iOS only)
export const signInWithApple = async (): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  if (Platform.OS !== 'ios') {
    return providerUnavailableAuthError('Apple Sign-In is only available on iOS');
  }

  try {
    // Replay-hardening: hand Apple the SHA-256 of a random nonce and give Supabase
    // the raw value so it can verify the token was minted for this exact request.
    // The nonce is required — if it cannot be generated we fail the sign-in rather
    // than fall back to an unhardened request.
    let nonce: { raw: string; hashed: string };
    try {
      nonce = await generateNoncePair();
    } catch (e) {
      return serviceUnavailableAuthError(e);
    }

    // iOS turns the app inactive under the native Apple sheet; discreet mode must
    // not take that for the reader leaving and lock mid-sign-in.
    const credential = await withPrivacyLockGrace(() =>
      AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: nonce.hashed,
      })
    );

    if (!credential.identityToken) {
      return providerUnavailableAuthError('No identity token received');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: nonce.raw,
    });

    if (error) {
      return mapProviderIdTokenAuthError('apple', error);
    }

    if (data.user) {
      // Update display name if provided by Apple
      if (credential.fullName?.givenName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');
        try {
          // Best-effort: the account already exists and the session is live, so a
          // failed display-name write must not turn a successful sign-in into an
          // error the user sees. An error *returned* here is already ignored;
          // a thrown one (transport failure) has to be ignored the same way.
          await supabase.auth.updateUser({
            data: { display_name: fullName },
          });
        } catch {
          // Ignored on purpose — see above.
        }
      }

      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Apple sign in failed');
  } catch (e) {
    return mapAppleAuthError(e);
  }
};

// Google Sign-In
// Android's CommonStatusCodes.DEVELOPER_ERROR (10). The native module rejects with
// the raw status number as the error code, and `statusCodes` does not expose it, so
// the literal is the only handle on "no Android OAuth client matches this build".
const GOOGLE_ANDROID_DEVELOPER_ERROR_CODE = '10';

export const signInWithGoogle = async (): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  try {
    const googleSignInAvailability = ensureGoogleSignInConfigured();

    if (!googleSignInAvailability.available) {
      return providerUnavailableAuthError(
        googleSignInAvailability.reason === 'android_client_id_only'
          ? 'Google sign in requires the web client ID for this build.'
          : 'Google sign in is not available on this build yet.'
      );
    }

    // Both calls can turn the app inactive under native Google UI (the Play
    // Services update prompt, the account picker sheet); discreet mode must not
    // take that for the reader leaving and lock mid-sign-in.
    if (Platform.OS === 'android') {
      await withPrivacyLockGrace(() => GoogleSignin.hasPlayServices());
    }

    const response = await withPrivacyLockGrace(() => GoogleSignin.signIn());

    // google-signin v16 RESOLVES with { type: 'cancelled', data: null } when the
    // user backs out — it no longer throws statusCodes.SIGN_IN_CANCELLED. Map it to
    // the silent 'cancelled' path so isSilentAuthError suppresses the alert.
    if (response.type === 'cancelled') {
      return mapGoogleAuthError({ code: 'SIGN_IN_CANCELLED' });
    }

    const idToken = response.data?.idToken;

    if (!idToken) {
      return providerUnavailableAuthError('No ID token received from Google');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return mapProviderIdTokenAuthError('google', error);
    }

    if (data.user) {
      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Google sign in failed');
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return mapGoogleAuthError({
            code: 'SIGN_IN_CANCELLED',
            message: error.message,
          });
        case statusCodes.IN_PROGRESS:
          return mapGoogleAuthError({
            code: 'IN_PROGRESS',
            message: error.message,
          });
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return mapGoogleAuthError({
            code: 'PLAY_SERVICES_NOT_AVAILABLE',
            message: error.message,
          });
        case GOOGLE_ANDROID_DEVELOPER_ERROR_CODE:
          // Android status 10: no Android OAuth client matches this build's
          // package name + signing certificate. It is indistinguishable from a
          // generic failure in the UI, so name it in logcat.
          console.error(
            '[Auth] Google DEVELOPER_ERROR — no Android OAuth client matches this build (package name / SHA-1 mismatch)',
            error.code
          );
          return mapGoogleAuthError({
            code: 'DEVELOPER_ERROR',
            message: error.message,
          });
        default:
          return mapGoogleAuthError(error);
      }
    }
    return unknownAuthError(error);
  }
};

// Sign out
/** Sign-out waits at most this long for the server to revoke the session. */
export const AUTH_SIGN_OUT_TIMEOUT_MS = 3_000;

/**
 * Ends the session on this device at once, then revokes it on the server for at most
 * AUTH_SIGN_OUT_TIMEOUT_MS.
 *
 * It does not call supabase.auth.signOut(): that runs inside auth-js's session lock
 * and first refreshes an expired token, which offline or on a dead connection retries
 * for about 25 s (and waits behind any refresh already holding the lock). Abandoning it
 * after a timeout would not help: it would still run later against whatever session is
 * stored by then, possibly the next account's, revoking and removing it. Instead:
 * - the refresh token is fenced (authRequestFence.ts), so a refresh already under way
 *   cannot save this session again or sign the reader back in;
 * - the stored session is removed without the lock or the network;
 * - the server is asked to revoke all of the account's sessions with the stored access
 *   token (auth.admin.signOut: a bare logout request that never reads or writes the
 *   stored session, so abandoning it is harmless). An expired token cannot be revoked
 *   without the refresh that hangs, and nothing can be sent offline; the server
 *   session is then left to expire, as before for an offline sign-out.
 */
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured()) {
    return { success: true }; // No session to sign out from
  }

  const stored = await readStoredSession();
  if (stored) {
    fenceRefreshToken(stored.refresh_token);
  }
  await endSessionOnThisDevice();

  if (!stored || isAccessTokenExpired(stored) || (await isDeviceOffline())) {
    return { success: true };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<{ success: boolean; error?: string }>((resolve) => {
    timer = setTimeout(
      () => resolve({ success: false, error: 'Sign-out request timed out' }),
      AUTH_SIGN_OUT_TIMEOUT_MS
    );
  });
  const result = await Promise.race([revokeSessionOnServer(stored.access_token), timeLimit]);
  clearTimeout(timer);
  return result;
};

// Like auth-js's own signOut: a token the server no longer accepts (401/403) or a
// user or session that no longer exists (404, session_not_found) means signed out.
const revokeSessionOnServer = async (
  accessToken: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.auth.admin.signOut(accessToken, 'global');
    if (
      error &&
      error.name !== 'AuthSessionMissingError' &&
      !(error.status !== undefined && [401, 403, 404].includes(error.status))
    ) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

// Removes the stored session without auth-js's lock or the network, and emits
// SIGNED_OUT. `_removeSession` is not public API; authSession.realClient.behavior
// .test.ts pins it against the installed supabase-js.
const endSessionOnThisDevice = async (): Promise<void> => {
  try {
    const auth = supabase.auth as unknown as { _removeSession?: () => Promise<void> };
    await auth._removeSession?.();
  } catch {
    // Best effort: the caller already reports the sign-out failure.
  }
};

// Password reset
export const resetPassword = async (
  email: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  try {
    // With the client's PKCE flow this also stores a code verifier in this
    // install's SecureStore; the emailed link only works where it was stored.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'com.everybible.app://reset-password',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

// Update the current user's password — used at the end of the password-reset deep link flow,
// after ResetPasswordScreen has exchanged the link's PKCE code for a recovery session.
export const updatePassword = async (newPassword: string): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  try {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      return mapSupabaseAuthError(error);
    }

    if (data.user) {
      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Failed to update password');
  } catch (e) {
    return unknownAuthError(e);
  }
};

// Update arbitrary fields on the current user's auth profile (email, password, or
// user_metadata via `data`). Wraps supabase.auth.updateUser so callers (e.g. the
// avatar update in ProfileScreen) go through mapSupabaseAuthError instead of
// surfacing raw, untranslated Supabase errors.
export const updateUserProfile = async (
  attributes: Parameters<typeof supabase.auth.updateUser>[0]
): Promise<AuthResult> => {
  if (!isSupabaseConfigured()) {
    return configurationAuthError();
  }

  try {
    const { data, error } = await supabase.auth.updateUser(attributes);

    if (error) {
      return mapSupabaseAuthError(error);
    }

    if (data.user) {
      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Failed to update profile');
  } catch (e) {
    return unknownAuthError(e);
  }
};
