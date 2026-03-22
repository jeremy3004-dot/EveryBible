import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
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

  // Sync on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        performSync();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
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
