import { useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../services/supabase';
import { syncAll, pullFromCloud } from '../services/sync';
import { useAuthStore } from '../stores/authStore';
import { createSyncCoordinator } from './syncCoordinator';

export const useSync = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const authenticatedUserId = useAuthStore((state) => state.user?.uid ?? null);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const appState = useRef(AppState.currentState);
  const initialSyncUserId = useRef<string | null>(null);
  const initialSyncGeneration = useRef<number | null>(null);
  const syncCoordinator = useMemo(() => createSyncCoordinator(), []);

  const runInitialPull = useCallback(async (userId: string, generation: number) => {
    const liveAuthState = useAuthStore.getState();
    if (liveAuthState.user?.uid !== userId || liveAuthState.authGeneration !== generation) {
      return { success: false };
    }

    // Before pulling/merging cloud data, reconcile the auth boundary so
    // guest/previous-account data never merges into this session (H2).
    useAuthStore.getState().reconcileUserBoundary(userId);
    return pullFromCloud(userId);
  }, []);

  const queueInitialPull = useCallback(
    (userId: string, generation: number) =>
      syncCoordinator.enqueuePull({ userId, generation }, () => runInitialPull(userId, generation)),
    [runInitialPull, syncCoordinator]
  );

  const performSync = useCallback(
    async (expectedUserId?: string, expectedGeneration?: number) => {
      const authState = useAuthStore.getState();
      const currentUserId = authState.user?.uid ?? null;
      const currentGeneration = authState.authGeneration;
      if (
        !authState.isInitialized ||
        !authState.isAuthenticated ||
        !currentUserId ||
        (expectedUserId !== undefined && currentUserId !== expectedUserId) ||
        (expectedGeneration !== undefined && currentGeneration !== expectedGeneration)
      ) {
        return;
      }

      try {
        await syncCoordinator.enqueuePush(
          { userId: currentUserId, generation: currentGeneration },
          async () => {
            await syncAll(currentUserId, currentGeneration);
          },
          () => runInitialPull(currentUserId, currentGeneration)
        );
      } catch {
        // Sync failure is non-fatal
      }
    },
    [runInitialPull, syncCoordinator]
  );

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

  // Initial sync when auth identity changes (uid or auth generation). The
  // cleanup flag matters when a pull started for account A resolves after the
  // auth boundary has already moved to account B or a new A session.
  useEffect(() => {
    let isCancelled = false;

    if (
      isInitialized &&
      isAuthenticated &&
      authenticatedUserId &&
      (initialSyncUserId.current !== authenticatedUserId ||
        initialSyncGeneration.current !== authGeneration)
    ) {
      initialSyncUserId.current = authenticatedUserId;
      initialSyncGeneration.current = authGeneration;
      const currentUserId = authenticatedUserId;
      const currentGeneration = authGeneration;

      void (async () => {
        try {
          if (
            isCancelled ||
            useAuthStore.getState().user?.uid !== currentUserId ||
            useAuthStore.getState().authGeneration !== currentGeneration
          )
            return;

          const pullSucceeded = await queueInitialPull(currentUserId, currentGeneration);
          if (!pullSucceeded) {
            return;
          }

          if (
            isCancelled ||
            useAuthStore.getState().user?.uid !== currentUserId ||
            useAuthStore.getState().authGeneration !== currentGeneration
          )
            return;
          await performSync(currentUserId, currentGeneration);
        } catch {
          // Initial cloud sync failure is non-fatal
        }
      })();
    }

    if (!isAuthenticated) {
      initialSyncUserId.current = null;
      initialSyncGeneration.current = null;
    }

    return () => {
      isCancelled = true;
    };
  }, [
    authGeneration,
    authenticatedUserId,
    isAuthenticated,
    isInitialized,
    queueInitialPull,
    performSync,
    syncCoordinator,
  ]);

  return { sync: performSync };
};
