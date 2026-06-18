import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  InteractionManager,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { migrateFromAsyncStorage } from './src/stores/migrateFromAsyncStorage';
import { useAuthStore } from './src/stores/authStore';
import { usePrivacyStore } from './src/stores/privacyStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PrivacyLockScreen } from './src/components/privacy/PrivacyLockScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import i18n, { changeLanguage } from './src/i18n';
import { LocaleSetupFlow } from './src/screens/onboarding/LocaleSetupFlow';
import { createStartupCoordinator } from './src/services/startup';
import { queryClient } from './src/services/queryClient';
import { setupNotificationHandler } from './src/services/notifications/notificationBootstrap';

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.error('Failed to keep splash screen visible:', error);
});

// Must be called at module scope BEFORE any component renders so that
// foreground notifications display a banner instead of being silently dropped.
setupNotificationHandler();

const ANDROID_BACKGROUND_STARTUP_DELAY_MS = 1500;
const FONT_LOAD_TIMEOUT_MS = 2500;
const STARTUP_READY_TIMEOUT_MS = 6000;

function scheduleAfterInteractions(task: () => void, delayMs = 0): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const handle = InteractionManager.runAfterInteractions(() => {
    timeoutId = setTimeout(task, delayMs);
  });

  return () => {
    handle.cancel();
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

function LoadingScreen() {
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    'Lora-Regular': require('./assets/fonts/Lora-Regular.ttf'),
    'Lora-Italic': require('./assets/fonts/Lora-Italic.ttf'),
  });
  const [isReady, setIsReady] = useState(Platform.OS === 'android');
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  const [shouldRenderNavigator, setShouldRenderNavigator] = useState(false);
  const warmupCancelRef = useRef<(() => void) | null>(null);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializePrivacy = usePrivacyStore((state) => state.initialize);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);
  const preferences = useAuthStore((state) => state.preferences);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const startupCoordinator = useMemo(
    () =>
      createStartupCoordinator({
        initializeAuth,
        initializePrivacy,
        preloadBibleData: async () => {
          const { initBibleData } = await import('./src/services/bible/bibleService');
          await initBibleData();
        },
        preloadRuntimeTranslations: async () => {
          const { bootstrapRuntimeTranslationsAndPreferences } =
            await import('./src/services/translations');
          await bootstrapRuntimeTranslationsAndPreferences();
          const { useBibleStore } = await import('./src/stores/bibleStore');
          await useBibleStore.getState().reconcileTranslationPacks();
        },
        migrateStorage: async () => {
          await migrateFromAsyncStorage();
        },
        scheduleTask: (task) => {
          return scheduleAfterInteractions(
            () => {
              void task();
            },
            Platform.OS === 'android' ? ANDROID_BACKGROUND_STARTUP_DELAY_MS : 0
          );
        },
        onWarmupError: (error) => {
          console.error('Deferred startup warmup failed:', error);
        },
        onCriticalTimeout: (taskName) => {
          console.warn(
            `Critical startup timed out during ${taskName}; continuing launch with safe defaults.`
          );
        },
      }),
    [initializeAuth, initializePrivacy]
  );

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setFontLoadTimedOut(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setFontLoadTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    let isMounted = true;
    const readyTimeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('Startup readiness timed out; continuing launch with safe defaults.');
        setIsReady(true);
      }
    }, STARTUP_READY_TIMEOUT_MS);

    async function initialize() {
      try {
        await startupCoordinator.initializeCritical();
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        clearTimeout(readyTimeoutId);
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void initialize();

    return () => {
      isMounted = false;
      clearTimeout(readyTimeoutId);
      if (warmupCancelRef.current) {
        warmupCancelRef.current();
        warmupCancelRef.current = null;
      }
    };
  }, [startupCoordinator]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void SplashScreen.hideAsync().catch((error) => {
      console.error('Failed to hide splash screen:', error);
    });
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !preferences.onboardingCompleted || warmupCancelRef.current) {
      return;
    }

    warmupCancelRef.current = startupCoordinator.startDeferredWarmups();

    return () => {
      if (warmupCancelRef.current) {
        warmupCancelRef.current();
        warmupCancelRef.current = null;
      }
    };
  }, [isReady, preferences.onboardingCompleted, startupCoordinator]);

  useEffect(() => {
    if (!isReady || !preferences.onboardingCompleted) {
      return;
    }

    let cancelRecovery: (() => void) | null = null;

    const recoverAudioDownloads = () => {
      cancelRecovery?.();
      cancelRecovery = scheduleAfterInteractions(
        () => {
          void import('./src/stores/bibleStore')
            .then(({ useBibleStore }) => useBibleStore.getState().reattachAudioDownloads())
            .catch((error) => {
              console.error('Failed to reattach persisted audio downloads:', error);
            });
        },
        Platform.OS === 'android' ? ANDROID_BACKGROUND_STARTUP_DELAY_MS : 0
      );
    };

    recoverAudioDownloads();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        recoverAudioDownloads();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      cancelRecovery?.();
      subscription.remove();
    };
  }, [isReady, preferences.onboardingCompleted]);

  useEffect(() => {
    if (preferences.language) {
      void changeLanguage(preferences.language);
    }
  }, [preferences.language]);

  useEffect(() => {
    if (!isReady || !preferences.onboardingCompleted || isPrivacyLocked) {
      setShouldRenderNavigator(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShouldRenderNavigator(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isPrivacyLocked, isReady, preferences.onboardingCompleted]);

  const shouldWaitForFonts =
    Platform.OS !== 'android' && !fontsLoaded && !fontError && !fontLoadTimedOut;

  if (!isReady || shouldWaitForFonts) {
    return <View style={[styles.bootShell, { backgroundColor: colors.background }]} />;
  }

  if (!preferences.onboardingCompleted) {
    return <LocaleSetupFlow mode="initial" onComplete={() => undefined} />;
  }

  if (isPrivacyLocked) {
    return <PrivacyLockScreen />;
  }

  if (!shouldRenderNavigator) {
    return <View style={[styles.bootShell, { backgroundColor: colors.background }]} />;
  }

  const { RootNavigator } =
    require('./src/navigation/RootNavigator') as typeof import('./src/navigation/RootNavigator');

  return <RootNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <SafeAreaProvider>
            <ThemeProvider>
              <AppContent />
            </ThemeProvider>
          </SafeAreaProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const onboardingCompleted = useAuthStore((state) => state.preferences.onboardingCompleted);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);
  const prevAuthRef = useRef(isAuthenticated);
  const prevUserUidRef = useRef(user?.uid ?? null);
  const anonymousUsageAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!onboardingCompleted || isPrivacyLocked) {
      return;
    }

    const startAnalyticsSessions = () => {
      void import('./src/services/analytics').then(
        ({
          startAnonymousUsageSession,
          initAnonymousSessionContext,
          startSession,
        }) => {
          if (isAuthenticated) {
            // Authenticated path: the session lifecycle event (session_started /
            // session_ended) is owned by analyticsService so it carries user_id.
            // We still establish an anonymous session_id context so that
            // audio_playback_progress, reading_ended, and chapter_completed —
            // which always flow through trackAnonymousUsageEvent for ALL users —
            // have a valid session_id. Without this setup those events would
            // lazily create a new anonymous session and emit their own
            // session_started, which is worse than just pre-creating the id.
            initAnonymousSessionContext();
            startSession();
          } else {
            // Unauthenticated path: anonymous analytics owns both the session
            // context and the session lifecycle event (session_started).
            startAnonymousUsageSession();
          }
        }
      );
    };

    const endAndFlushAnalyticsSessions = () => {
      void import('./src/services/analytics').then(
        ({
          endAnonymousUsageSession,
          clearAnonymousSessionContext,
          flushAnonymousUsageEvents,
          endSession,
          flushEvents,
        }) => {
          if (isAuthenticated) {
            // Authenticated path: session_ended is emitted by the authenticated
            // analytics path. We only reset the anonymous session_id context (no
            // duplicate session_ended event) and flush both queues so audio /
            // reading events captured during this session are delivered.
            clearAnonymousSessionContext();
            endSession();
          } else {
            // Unauthenticated path: anonymous analytics owns the session_ended event.
            endAnonymousUsageSession();
          }
          // Always flush both queues — audio/reading events land in the anonymous
          // queue and authenticated events (if any) land in the authenticated queue.
          void flushAnonymousUsageEvents();
          void flushEvents();
        }
      );
    };

    if (AppState.currentState === 'active') {
      startAnalyticsSessions();
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousAppState = anonymousUsageAppStateRef.current;

      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        startAnalyticsSessions();
      }

      if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
        endAndFlushAnalyticsSessions();
      }

      anonymousUsageAppStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();

      if (anonymousUsageAppStateRef.current === 'active') {
        endAndFlushAnalyticsSessions();
      }
    };
  }, [isPrivacyLocked, onboardingCompleted]);

  // Set up Android notification channels on mount (idempotent, no-op on iOS).
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      void import('./src/services/notifications').then(({ setupAndroidChannels }) =>
        setupAndroidChannels()
      );
    });

    return () => {
      handle.cancel();
    };
  }, []);

  // Register push token after authentication. Re-runs whenever the user changes.
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      void import('./src/services/notifications').then(({ registerPushToken }) =>
        registerPushToken(user.uid)
      );
    }
  }, [isAuthenticated, user?.uid]);

  // Deactivate push token when the user signs out (auth state transitions from
  // authenticated to unauthenticated).
  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current;
    const prevUid = prevUserUidRef.current;
    prevAuthRef.current = isAuthenticated;
    prevUserUidRef.current = user?.uid ?? null;

    if (wasAuthenticated && !isAuthenticated && prevUid) {
      void import('./src/services/notifications').then(({ deactivatePushToken }) =>
        deactivatePushToken(prevUid)
      );
    }
  }, [isAuthenticated, user?.uid]);

  // Listen for notification taps — used for future navigate-to-screen support.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      // Future: navigate based on data.screen, data.groupId, etc.
      console.log('[Notifications] Tapped notification:', data);
    });
    return () => subscription.remove();
  }, []);

  // Listen for push token refreshes and re-register with the updated token.
  useEffect(() => {
    const subscription = Notifications.addPushTokenListener((devicePushToken) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.uid) {
        void import('./src/services/notifications').then(({ registerPushToken }) =>
          registerPushToken(currentUser.uid, devicePushToken)
        );
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppRuntimeEffectsHost enabled={onboardingCompleted} />
      <ErrorBoundary>
        <LoadingScreen />
      </ErrorBoundary>
    </>
  );
}

type RuntimeEffectsComponent = () => null;

function AppRuntimeEffectsHost({ enabled }: { enabled: boolean }) {
  const [RuntimeEffects, setRuntimeEffects] = useState<RuntimeEffectsComponent | null>(null);

  useEffect(() => {
    if (!enabled || RuntimeEffects) {
      return;
    }

    let isCancelled = false;
    const cancelRuntimeEffectsLoad = scheduleAfterInteractions(
      () => {
        void import('./src/services/startup/AppRuntimeEffects')
          .then(({ AppRuntimeEffects }) => {
            if (!isCancelled) {
              setRuntimeEffects(() => AppRuntimeEffects);
            }
          })
          .catch((error) => {
            console.error('Failed to load runtime app effects:', error);
          });
      },
      Platform.OS === 'android' ? ANDROID_BACKGROUND_STARTUP_DELAY_MS : 0
    );

    return () => {
      isCancelled = true;
      cancelRuntimeEffectsLoad();
    };
  }, [RuntimeEffects, enabled]);

  return RuntimeEffects ? <RuntimeEffects /> : null;
}

const styles = StyleSheet.create({
  bootShell: {
    flex: 1,
  },
  gestureRoot: {
    flex: 1,
  },
});
