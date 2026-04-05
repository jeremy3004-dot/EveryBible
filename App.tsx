import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus, InteractionManager, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { openAuthFlow, type PendingAuthMode } from './src/navigation/rootNavigation';
import { initBibleData } from './src/services/bible/bibleService';
import { bootstrapRuntimeTranslationsAndPreferences } from './src/services/translations';
import { migrateFromAsyncStorage } from './src/stores/migrateFromAsyncStorage';
import { useAuthStore } from './src/stores/authStore';
import { useBibleStore } from './src/stores/bibleStore';
import { usePrivacyStore } from './src/stores/privacyStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PrivacyLockScreen } from './src/components/privacy/PrivacyLockScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { usePrivacyLock } from './src/hooks/usePrivacyLock';
import { useSync } from './src/hooks/useSync';
import i18n, { changeLanguage } from './src/i18n';
import { LocaleSetupFlow } from './src/screens/onboarding/LocaleSetupFlow';
import { createStartupCoordinator } from './src/services/startup';
import { queryClient } from './src/services/queryClient';
import {
  endAnonymousUsageSession,
  flushAnonymousUsageEvents,
  startAnonymousUsageSession,
  endSession,
  flushEvents,
  startSession,
} from './src/services/analytics';
import {
  setupNotificationHandler,
  setupAndroidChannels,
  registerPushToken,
  deactivatePushToken,
} from './src/services/notifications';

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.error('Failed to keep splash screen visible:', error);
});

// Must be called at module scope BEFORE any component renders so that
// foreground notifications display a banner instead of being silently dropped.
setupNotificationHandler();

interface LoadingScreenProps {
  onInitialAuthRequest: (mode: PendingAuthMode | null) => void;
}

function LoadingScreen({ onInitialAuthRequest }: LoadingScreenProps) {
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    'Lora-Regular': require('./assets/fonts/Lora-Regular.ttf'),
    'Lora-Italic': require('./assets/fonts/Lora-Italic.ttf'),
  });
  const [isReady, setIsReady] = useState(false);
  const [shouldRenderNavigator, setShouldRenderNavigator] = useState(false);
  const warmupCancelRef = useRef<(() => void) | null>(null);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializePrivacy = usePrivacyStore((state) => state.initialize);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);
  const preferences = useAuthStore((state) => state.preferences);
  const reconcileTranslationPacks = useBibleStore((state) => state.reconcileTranslationPacks);
  const reattachAudioDownloads = useBibleStore((state) => state.reattachAudioDownloads);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const startupCoordinator = useMemo(
    () =>
      createStartupCoordinator({
        initializeAuth,
        initializePrivacy,
        preloadBibleData: initBibleData,
        preloadRuntimeTranslations: bootstrapRuntimeTranslationsAndPreferences,
        migrateStorage: async () => {
          await migrateFromAsyncStorage();
          await reconcileTranslationPacks();
        },
        scheduleTask: (task) => {
          const handle = InteractionManager.runAfterInteractions(() => {
            void task();
          });

          return () => {
            handle.cancel();
          };
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
    [initializeAuth, initializePrivacy, reconcileTranslationPacks]
  );

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        await startupCoordinator.initializeCritical();
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void initialize();

    return () => {
      isMounted = false;
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

    const recoverAudioDownloads = () => {
      void reattachAudioDownloads().catch((error) => {
        console.error('Failed to reattach persisted audio downloads:', error);
      });
    };

    recoverAudioDownloads();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        recoverAudioDownloads();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isReady, preferences.onboardingCompleted, reattachAudioDownloads]);

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

  if (!isReady || (!fontsLoaded && !fontError)) {
    return null;
  }

  if (!preferences.onboardingCompleted) {
    return (
      <LocaleSetupFlow
        mode="initial"
        onComplete={(result) => {
          const accessMode = result?.accessMode;
          onInitialAuthRequest(
            accessMode === 'signIn' ? 'SignIn' : accessMode === 'signUp' ? 'SignUp' : null
          );
        }}
      />
    );
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
  const pendingInitialAuthModeRef = useRef<PendingAuthMode | null>(null);
  const onboardingCompletedRef = useRef(onboardingCompleted);
  const prevAuthRef = useRef(isAuthenticated);
  const prevUserUidRef = useRef(user?.uid ?? null);
  const anonymousUsageAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  useSync();
  usePrivacyLock();

  useEffect(() => {
    if (!onboardingCompleted || isPrivacyLocked) {
      return;
    }

    if (AppState.currentState === 'active') {
      startAnonymousUsageSession();
      startSession();
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousAppState = anonymousUsageAppStateRef.current;

      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        startAnonymousUsageSession();
        startSession();
      }

      if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
        endAnonymousUsageSession();
        void flushAnonymousUsageEvents();
        endSession();
        void flushEvents();
      }

      anonymousUsageAppStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();

      if (anonymousUsageAppStateRef.current === 'active') {
        endAnonymousUsageSession();
        void flushAnonymousUsageEvents();
        endSession();
        void flushEvents();
      }
    };
  }, [isPrivacyLocked, onboardingCompleted]);

  // Set up Android notification channels on mount (idempotent, no-op on iOS).
  useEffect(() => {
    void setupAndroidChannels();
  }, []);

  // Register push token after authentication. Re-runs whenever the user changes.
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      void registerPushToken(user.uid);
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
      void deactivatePushToken(prevUid);
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
        void registerPushToken(currentUser.uid, devicePushToken);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    onboardingCompletedRef.current = onboardingCompleted;
  }, [onboardingCompleted]);

  useEffect(() => {
    if (!onboardingCompleted || !pendingInitialAuthModeRef.current) {
      return;
    }

    const mode = pendingInitialAuthModeRef.current;
    pendingInitialAuthModeRef.current = null;
    openAuthFlow(mode);
  }, [onboardingCompleted]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ErrorBoundary>
        <LoadingScreen
          onInitialAuthRequest={(mode) => {
            if (!mode) {
              pendingInitialAuthModeRef.current = null;
              return;
            }

            if (onboardingCompletedRef.current) {
              openAuthFlow(mode);
              return;
            }

            pendingInitialAuthModeRef.current = mode;
          }}
        />
      </ErrorBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  bootShell: {
    flex: 1,
  },
  gestureRoot: {
    flex: 1,
  },
});
