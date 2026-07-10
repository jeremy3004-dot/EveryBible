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
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
} from '@expo-google-fonts/lora';
import { migrateFromAsyncStorage } from './src/stores/migrateFromAsyncStorage';
import { useAuthStore } from './src/stores/authStore';
import { usePrivacyStore } from './src/stores/privacyStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PrivacyLockScreen } from './src/components/privacy/PrivacyLockScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import i18n, { changeLanguage } from './src/i18n';
import { createStartupCoordinator } from './src/services/startup';
import { queryClient } from './src/services/queryClient';
import { setupNotificationHandler } from './src/services/notifications/notificationBootstrap';
import { installGlobalErrorHandlers } from './src/services/diagnostics/globalErrorHandler';
import { enforceLtrLayoutPolicy } from './src/services/startup/rtlPolicy';
import { rootNavigationRef } from './src/navigation/rootNavigation';

console.log('[EB-T] App:module-start', Date.now());

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.error('Failed to keep splash screen visible:', error);
});

// Must be called at module scope BEFORE any component renders so that
// foreground notifications display a banner instead of being silently dropped.
setupNotificationHandler();

// Must also run before render: captures crashes/rejections from the earliest
// possible point in boot, not just ones that happen once React is mounted.
installGlobalErrorHandlers();

// Must run before render too — native RTL layout is applied at launch based
// on device locale, before any screen has a chance to opt out.
enforceLtrLayoutPolicy();

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
  console.log('[EB-T] LoadingScreen:render', Date.now());
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_700Bold,
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

    // Pre-warm the ~750KB gatherArtwork SVG string table during idle time so its
    // eval lands here rather than as a one-time hitch on the first Home render.
    const cancelArtworkPrewarm = scheduleAfterInteractions(() => {
      void import('./src/data/gatherArtwork').catch((error) => {
        console.error('Failed to pre-warm gather artwork:', error);
      });
    });

    return () => {
      cancelArtworkPrewarm();
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
    return (
      <View style={[styles.bootShell, { backgroundColor: colors.background }]}>
        <OnboardingHost />
      </View>
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

type LocaleSetupFlowComponent = typeof import('./src/screens/onboarding/LocaleSetupFlow')['LocaleSetupFlow'];

// Async-load the onboarding flow so its heavy import graph (bibleStore hydration,
// @supabase/supabase-js, translations service) evaluates off the render pass
// instead of synchronously blocking the JS thread on a brand-new install.
function OnboardingHost() {
  const [LocaleSetupFlow, setLocaleSetupFlow] = useState<LocaleSetupFlowComponent | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void import('./src/screens/onboarding/LocaleSetupFlow')
      .then(({ LocaleSetupFlow: Component }) => {
        if (!isCancelled) {
          setLocaleSetupFlow(() => Component);
        }
      })
      .catch((error) => {
        console.error('Failed to load onboarding flow:', error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return LocaleSetupFlow ? <LocaleSetupFlow mode="initial" onComplete={() => undefined} /> : null;
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
          primeGeoContext,
        }) => {
          // Resolve geo ONCE per foreground (fire-and-forget, timed out) so the
          // flush — which fires on app-background when the network may be gone —
          // attaches cached location instead of losing the race to server IP.
          void primeGeoContext();
          // Read auth live at call time so a mid-session sign-in/out is attributed
          // correctly without tearing down the AppState listener on every auth change.
          if (useAuthStore.getState().isAuthenticated) {
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
          if (useAuthStore.getState().isAuthenticated) {
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

  // Password-reset deep links must be handled regardless of onboarding state — a
  // reset link tapped on a never-onboarded install still needs to establish the
  // recovery session and (once navigation is ready) route to ResetPassword. The
  // onboarding-gated AppRuntimeEffects listener only covers onboarded installs.
  // authDeepLink is loaded via dynamic import() so the Supabase client (and all of
  // @supabase/supabase-js) it pulls in stays off the static boot graph.
  useEffect(() => {
    let isMounted = true;
    let readinessInterval: ReturnType<typeof setInterval> | null = null;

    // Only poll for navigation readiness after a reset link is actually seen, so we
    // don't run a perpetual timer on installs that never receive one. The flush is a
    // no-op unless a reset navigation was queued while navigation was not yet ready.
    const scheduleResetFlush = () => {
      if (readinessInterval) {
        return;
      }
      readinessInterval = setInterval(() => {
        if (!rootNavigationRef.isReady()) {
          return;
        }
        void import('./src/services/auth/authDeepLink').then(
          ({ flushPendingResetPasswordNavigation }) => flushPendingResetPasswordNavigation()
        );
        if (readinessInterval) {
          clearInterval(readinessInterval);
          readinessInterval = null;
        }
      }, 250);
    };

    const handleUrl = (url: string) => {
      void import('./src/services/auth/authDeepLink').then(({ handleAuthDeepLinkUrl }) => {
        void handleAuthDeepLinkUrl(url);
        if (isMounted) {
          scheduleResetFlush();
        }
      });
    };

    Linking.getInitialURL()
      .then((url) => {
        if (isMounted && url) {
          handleUrl(url);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
      if (readinessInterval) {
        clearInterval(readinessInterval);
      }
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

  // Push-token deactivation on sign-out is owned by authStore.signOut (it runs
  // before the supabase sign-out, while the session is still valid), so there is
  // no dedicated deactivation effect here.

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
