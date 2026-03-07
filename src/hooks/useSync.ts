import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncAll, pullFromCloud } from '../services/sync';
import { useAuthStore } from '../stores/authStore';

export const useSync = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const appState = useRef(AppState.currentState);
  const isSyncing = useRef(false);

  const performSync = useCallback(async () => {
    if (!isAuthenticated || isSyncing.current) return;

    isSyncing.current = true;
    try {
      await syncAll();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      isSyncing.current = false;
    }
  }, [isAuthenticated]);

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

  // Sync on network reconnect
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        performSync();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [performSync]);

  // Initial sync when auth changes
  useEffect(() => {
    if (isAuthenticated) {
      void (async () => {
        try {
          await pullFromCloud();
          await performSync();
        } catch (error) {
          console.error('Initial cloud sync error:', error);
        }
      })();
    }
  }, [isAuthenticated, performSync]);

  return { sync: performSync };
};
