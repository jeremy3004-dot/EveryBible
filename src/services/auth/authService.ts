import { supabase, isSupabaseConfigured } from '../supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import type { User } from '../../types';
import type { AuthErrorCode } from './authErrors';
import {
  configurationAuthError,
  mapAppleAuthError,
  mapGoogleAuthError,
  mapSupabaseAuthError,
  providerUnavailableAuthError,
  unknownAuthError,
} from './authErrors';

// Configure Google Sign-In on module load
GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
  code?: AuthErrorCode;
}

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
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return providerUnavailableAuthError('No identity token received');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      return mapSupabaseAuthError(error);
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
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;

    if (!idToken) {
      return providerUnavailableAuthError('No ID token received from Google');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return mapSupabaseAuthError(error);
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
    return { success: false, error: 'Supabase is not configured' };
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

// Get current session
export const getCurrentSession = async () => {
  if (!isSupabaseConfigured()) {
    return { session: null, user: null };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    return { session, user: mapSupabaseUser(session.user) };
  }
  return { session: null, user: null };
};
