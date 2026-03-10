import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createLazyClientAccessor } from './lazyClient';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// SecureStore adapter for Supabase auth
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const getSupabaseClient = createLazyClientAccessor({
  createClient: () =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }),
});

// Keep the runtime client generic until types can be generated from the live project.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseClient();
    const value = Reflect.get(client as object, property);

    if (typeof value === 'function') {
      return value.bind(client);
    }

    return value;
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return HAS_SUPABASE_CONFIG;
};

// Get current user ID helper
export const getCurrentUserId = async (): Promise<string | null> => {
  if (!HAS_SUPABASE_CONFIG) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};
