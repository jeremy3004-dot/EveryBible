import { supabase, isSupabaseConfigured } from '../supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import type { User } from '../../types';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import { createGoogleSignInInitializer } from './googleSignIn';
import type { AuthErrorCode } from './authErrors';
import {
  configurationAuthError,
  mapAppleAuthError,
  mapGoogleAuthError,
  mapProviderIdTokenAuthError,
  mapSupabaseAuthError,
  providerUnavailableAuthError,
  unknownAuthError,
} from './authErrors';

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
// provider (Supabase) and the SHA-256 hash is embedded in the token request to
// the OAuth provider (Apple). expo-crypto is not a dependency here, so we use the
// WebCrypto primitives the runtime already exposes (same source bibleDataModel.ts
// relies on for signed-manifest verification). Returns null when WebCrypto is
// unavailable so sign-in still proceeds without the extra hardening.
const generateNoncePair = async (): Promise<{ raw: string; hashed: string } | null> => {
  const webCrypto = globalThis.crypto as
    | (Crypto & { subtle?: SubtleCrypto })
    | undefined;

  if (
    !webCrypto ||
    typeof webCrypto.getRandomValues !== 'function' ||
    !webCrypto.subtle ||
    typeof webCrypto.subtle.digest !== 'function'
  ) {
    return null;
  }

  const randomBytes = webCrypto.getRandomValues(new Uint8Array(32));
  const raw = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  const digest = await webCrypto.subtle.digest(
    'SHA-256',
    new globalThis.TextEncoder().encode(raw)
  );
  const hashed = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');

  return { raw, hashed };
};

// Convert Supabase user to app User type
const mapSupabaseUser = (supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string; display_name?: string };
  created_at?: string;
}): User => ({
  uid: supabaseUser.id,
  email: supabaseUser.email ?? null,
  displayName:
    supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.full_name || null,
  photoURL: supabaseUser.user_metadata?.avatar_url ?? null,
  createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at).getTime() : Date.now(),
  lastActive: Date.now(),
});

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
    const nonce = await generateNoncePair();

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      ...(nonce ? { nonce: nonce.hashed } : {}),
    });

    if (!credential.identityToken) {
      return providerUnavailableAuthError('No identity token received');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      ...(nonce ? { nonce: nonce.raw } : {}),
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
        await supabase.auth.updateUser({
          data: { display_name: fullName },
        });
      }

      return { success: true, user: mapSupabaseUser(data.user) };
    }

    return unknownAuthError('Apple sign in failed');
  } catch (e) {
    return mapAppleAuthError(e);
  }
};

// Google Sign-In
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

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices();
    }

    const response = await GoogleSignin.signIn();

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
        default:
          return mapGoogleAuthError(error);
      }
    }
    return unknownAuthError(error);
  }
};

// Sign out
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured()) {
    return { success: true }; // No session to sign out from
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
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
// after handleAuthDeepLinkUrl has already established a recovery session via setSession.
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

// Get current session
export const getCurrentSession = async () => {
  if (!isSupabaseConfigured()) {
    return { session: null, user: null };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      return { session, user: mapSupabaseUser(session.user) };
    }

    return { session: null, user: null };
  } catch (error) {
    console.error('Failed to restore auth session:', error);
    return { session: null, user: null };
  }
};
