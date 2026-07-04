import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../services/supabase';
import { syncAll, pullFromCloud } from '../services/sync';
import { useAuthStore } from '../stores/authStore';

export const useSync = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const appState = useRef(AppState.currentState);
  const isSyncing = useRef(false);
  const hasInitialSynced = useRef(false);

  const performSync = useCallback(async () => {
    if (!isInitialized || !isAuthenticated || isSyncing.current) return;

    isSyncing.current = true;
    try {
      await syncAll();
    } catch {
      // Sync failure is non-fatal
    } finally {
      isSyncing.current = false;
    }
  }, [isAuthenticated, isInitialized]);

  // Sync on app foreground, and drive Supabase's auth auto-refresh with the app
  // lifecycle (L11): refresh only while foregrounded so long-backgrounded
  // sessions don't produce a first-request 401 on return.
  useEffect(() => {
    // Match the initial state so we start refreshing when mounted in foreground.
    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        supabase.auth.startAutoRefresh();
        performSync();
      } else if (nextAppState.match(/inactive|background/)) {
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [performSync]);

  // Sync on network reconnect (skip the initial state callback from NetInfo)
  useEffect(() => {
    let isFirstCallback = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (isFirstCallback) {
        isFirstCallback = false;
        return;
      }
      if (state.isConnected && state.isInternetReachable) {
        performSync();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [performSync]);

  // Initial sync when auth changes (runs once per auth state change)
  useEffect(() => {
    if (isInitialized && isAuthenticated && !hasInitialSynced.current) {
      hasInitialSynced.current = true;
      void (async () => {
        try {
          // Before pulling/merging cloud data, reconcile the auth boundary: if
          // this device last synced a different account, wipe the previous
          // account's per-user local data so it never merges into this one (H2).
          const currentUserId = useAuthStore.getState().user?.uid;
          if (currentUserId) {
            useAuthStore.getState().reconcileUserBoundary(currentUserId);
          }
          await pullFromCloud();
          await performSync();
        } catch {
          // Initial cloud sync failure is non-fatal
        }
      })();
    }

    if (!isAuthenticated) {
      hasInitialSynced.current = false;
    }
  }, [isAuthenticated, isInitialized, performSync]);

  return { sync: performSync };
};
