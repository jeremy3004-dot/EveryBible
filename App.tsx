import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
} from '@expo-google-fonts/lora';
import { useAuthStore } from './src/stores/authStore';
import { usePrivacyStore } from './src/stores/privacyStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PrivacyLockScreen } from './src/components/privacy/PrivacyLockScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import i18n, { changeLanguage } from './src/i18n';
import { getStoredInterfaceLanguageToApply } from './src/i18n/interfaceLanguagePolicy';
import {
  createAuthInitializer,
  createPrivacyRetryInitializer,
  createStartupCoordinator,
} from './src/services/startup';
import { setupNotificationHandler } from './src/services/notifications/notificationBootstrap';
import { installGlobalErrorHandlers } from './src/services/diagnostics/globalErrorHandler';
import {
  flushPendingCrashReportsAtLaunch,
  reportHandledError,
} from './src/services/diagnostics/crashReportQueue';
import { enforceLtrLayoutPolicy } from './src/services/startup/rtlPolicy';
import { rootNavigationRef } from './src/navigation/rootNavigation';
import { usePushTokenRegistration } from './src/hooks/usePushTokenRegistration';
import { useNotificationTapRouting } from './src/hooks/useNotificationTapRouting';
import { useAudioDownloadRecovery } from './src/hooks/useAudioDownloadRecovery';
import { useAppSessionAnalytics } from './src/hooks/useAppSessionAnalytics';
import { lockAfterPrivacyLockFailure, usePrivacyLock } from './src/hooks/usePrivacyLock';

// KEEP THIS UNGUARDED. scripts/benchmark-android-startup.py and
// scripts/android_startup_metrics.py parse `[EB-T] App:module-start` (and
// `Home:interaction-ready` from HomeScreen) out of release logcat to compute
// cold-start timings; guarding it behind __DEV__ silently breaks those tools.
// Every other [EB-T] sentinel in this file is dev-only.
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

function PrivacyInitializationRetryScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.privacyRetryShell, { backgroundColor: colors.background }]}>
      <View style={[styles.privacyRetryCard, { backgroundColor: colors.bibleElevatedSurface }]}>
        <Text style={[styles.privacyRetryTitle, { color: colors.biblePrimaryText }]}>
          {i18n.t('common.error')}
        </Text>
        <Text style={[styles.privacyRetryBody, { color: colors.bibleSecondaryText }]}>
          {i18n.t('loading.errorLoading')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void onRetry()}
          style={[styles.privacyRetryButton, { backgroundColor: colors.bibleAccent }]}
        >
          <Text style={[styles.privacyRetryButtonText, { color: colors.background }]}>
            {i18n.t('common.retry')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function LoadingScreen() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[EB-T] LoadingScreen:render', Date.now());
  }
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_700Bold,
    // Every Language display face. Self-hosted from the EL kit (converted from
    // the kit's .woff to .ttf, which React Native requires) — it is not on
    // Google Fonts. Two weights only; see src/design/fonts.ts.
    'AlteHaasGrotesk-Regular': require('./assets/fonts/AlteHaasGrotesk-Regular.ttf'),
    'AlteHaasGrotesk-Bold': require('./assets/fonts/AlteHaasGrotesk-Bold.ttf'),
  });
  const [isReady, setIsReady] = useState(Platform.OS === 'android');
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  const [shouldRenderNavigator, setShouldRenderNavigator] = useState(false);
  const [RootNavigator, setRootNavigator] = useState<RootNavigatorComponent | null>(null);
  const warmupCancelRef = useRef<(() => void) | null>(null);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializePrivacy = usePrivacyStore((state) => state.initialize);
  const retryInitializePrivacy = usePrivacyStore((state) => state.retryInitialize);
  const isPrivacyInitialized = usePrivacyStore((state) => state.isInitialized);
  const privacyInitializationError = usePrivacyStore((state) => state.initializationError);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);
  // Only the fields this screen gates on. It renders the whole navigator, so
  // subscribing to every preference re-rendered all mounted screens on any write.
  const onboardingCompleted = useAuthStore((state) => state.preferences.onboardingCompleted);
  const storedLanguage = useAuthStore((state) => state.preferences.language);
  const initializeAuthAfterStorage = useMemo(
    () =>
      createAuthInitializer({
        rehydrateAuth: () => useAuthStore.persist.rehydrate(),
        initializeAuth,
      }),
    [initializeAuth]
  );
  const retryPrivacyAndAuth = useMemo(
    () =>
      createPrivacyRetryInitializer({
        retryPrivacy: retryInitializePrivacy,
        isPrivacyInitialized: () => usePrivacyStore.getState().isInitialized,
        initializeAuth: initializeAuthAfterStorage,
      }),
    [initializeAuthAfterStorage, retryInitializePrivacy]
  );
  const startupCoordinator = useMemo(
    () =>
      createStartupCoordinator({
        initializeAuth: initializeAuthAfterStorage,
        initializePrivacy,
        isPrivacyInitialized: () => usePrivacyStore.getState().isInitialized,
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
          // Covers a bundled Bible database that cannot be imported and a failed
          // translation bootstrap; both are caught here, so report them.
          reportHandledError('startup.warmup', error);
        },
        onCriticalTimeout: (taskName) => {
          console.warn(
            taskName === 'privacy'
              ? 'Privacy initialization timed out; keeping launch locked until retry.'
              : `Critical startup timed out during ${taskName}; continuing launch with safe defaults.`
          );
        },
      }),
    [initializeAuthAfterStorage, initializePrivacy]
  );

  // The navigator module is ~670KB of import closure. A synchronous require()
  // in the render body evaluated all of it inside a commit; load it the same
  // async way OnboardingHost and AppRuntimeEffectsHost load theirs.
  useEffect(() => {
    if (!shouldRenderNavigator || RootNavigator) {
      return;
    }

    let isCancelled = false;
    void import('./src/navigation/RootNavigator')
      .then(({ RootNavigator: Component }) => {
        if (!isCancelled) {
          setRootNavigator(() => Component);
        }
      })
      .catch((error) => {
        console.error('Failed to load the root navigator:', error);
      });

    return () => {
      isCancelled = true;
    };
  }, [RootNavigator, shouldRenderNavigator]);

  const shouldWaitForFonts =
    Platform.OS !== 'android' && !fontsLoaded && !fontError && !fontLoadTimedOut;

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

  // Hiding the splash the instant `isReady` flips, while the render below is
  // still withholding content for fonts, leaves iOS staring at a blank shell for
  // up to FONT_LOAD_TIMEOUT_MS. Keep the splash up until there is real content
  // to hand over.
  useEffect(() => {
    if (!isReady || shouldWaitForFonts) {
      return;
    }

    void SplashScreen.hideAsync().catch((error) => {
      console.error('Failed to hide splash screen:', error);
    });
  }, [isReady, shouldWaitForFonts]);

  useEffect(() => {
    if (!isReady || !onboardingCompleted || warmupCancelRef.current) {
      return;
    }

    warmupCancelRef.current = startupCoordinator.startDeferredWarmups();

    return () => {
      if (warmupCancelRef.current) {
        warmupCancelRef.current();
        warmupCancelRef.current = null;
      }
    };
  }, [isReady, onboardingCompleted, startupCoordinator]);

  useAudioDownloadRecovery(isReady && Boolean(onboardingCompleted), (task) =>
    scheduleAfterInteractions(
      task,
      Platform.OS === 'android' ? ANDROID_BACKGROUND_STARTUP_DELAY_MS : 0
    )
  );

  const storedInterfaceLanguage = getStoredInterfaceLanguageToApply({
    language: storedLanguage,
    onboardingCompleted,
  });
  useEffect(() => {
    if (storedInterfaceLanguage) {
      void changeLanguage(storedInterfaceLanguage);
    }
  }, [storedInterfaceLanguage]);

  useEffect(() => {
    if (!isReady || !onboardingCompleted || !isPrivacyInitialized || isPrivacyLocked) {
      setShouldRenderNavigator(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShouldRenderNavigator(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isPrivacyInitialized, isPrivacyLocked, isReady, onboardingCompleted]);

  if (privacyInitializationError) {
    return <PrivacyInitializationRetryScreen onRetry={retryPrivacyAndAuth} />;
  }

  if (!isReady || !isPrivacyInitialized || shouldWaitForFonts) {
    return <View style={[styles.bootShell, { backgroundColor: colors.background }]} />;
  }

  if (isPrivacyLocked) {
    return <PrivacyLockScreen />;
  }

  if (!onboardingCompleted) {
    return (
      <View style={[styles.bootShell, { backgroundColor: colors.background }]}>
        <OnboardingHost />
      </View>
    );
  }

  if (!shouldRenderNavigator || !RootNavigator) {
    return <View style={[styles.bootShell, { backgroundColor: colors.background }]} />;
  }

  return <RootNavigator />;
}

type RootNavigatorComponent = (typeof import('./src/navigation/RootNavigator'))['RootNavigator'];

type LocaleSetupFlowComponent =
  (typeof import('./src/screens/onboarding/LocaleSetupFlow'))['LocaleSetupFlow'];

// Async-load the onboarding flow so its heavy import graph (bibleStore hydration,
// @supabase/supabase-js, translations service) evaluates off the render pass
// instead of synchronously blocking the JS thread on a brand-new install.
function OnboardingHost() {
  const [LocaleSetupFlow, setLocaleSetupFlow] = useState<LocaleSetupFlowComponent | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void import('./src/screens/onboarding/LocaleSetupFlow')
      .then(({ LocaleSetupFlow: Component }) => {
        // Build the locale Fuse index before the flow mounts, so the first
        // keystroke in the language picker is not paying for it mid-render.
        void import('./src/services/onboarding/localeSelection')
          .then(({ prewarmLocaleSearchEngine }) => prewarmLocaleSearchEngine())
          .catch((error) => {
            console.warn('Failed to pre-warm the locale search engine:', error);
          });
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
      {/* Last-resort boundary: a throw in a provider or in AppContent's own hooks
          and effects (deep links, push registration, session analytics) had no
          boundary and was a fatal crash. Its fallback needs neither provider. */}
      <ErrorBoundary scope="root">
        <I18nextProvider i18n={i18n}>
          <SafeAreaProvider>
            <ThemeProvider>
              <AppContent />
            </ThemeProvider>
          </SafeAreaProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const onboardingCompleted = useAuthStore((state) => state.preferences.onboardingCompleted);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isPrivacyInitialized = usePrivacyStore((state) => state.isInitialized);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);

  useAppSessionAnalytics(Boolean(onboardingCompleted) && !isPrivacyLocked);

  // Set up Android notification channels on mount (idempotent). Channels exist only
  // on Android, and the import alone evaluates the whole notification service
  // (~120 modules), so iOS skips it. Push-token registration and the daily-reminder
  // reconciler load the service themselves when they have work to do.
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const handle = InteractionManager.runAfterInteractions(() => {
      void import('./src/services/notifications')
        .then(({ setupAndroidChannels }) => setupAndroidChannels())
        .catch((error) => {
          console.warn('Failed to set up Android notification channels:', error);
        });
    });

    return () => {
      handle.cancel();
    };
  }, []);

  // Crash reports from an earlier launch go out once, after the first interactions,
  // whether or not onboarding has finished. The runtime effects that own ongoing uploads
  // mount only after onboarding, so a crash loop during onboarding would never be sent.
  useEffect(
    () =>
      scheduleAfterInteractions(
        () => void flushPendingCrashReportsAtLaunch(),
        Platform.OS === 'android' ? ANDROID_BACKGROUND_STARTUP_DELAY_MS : 0
      ),
    []
  );

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

  usePushTokenRegistration(isAuthenticated, user?.uid);

  // Push-token deactivation on sign-out is owned by authStore.signOut (it runs
  // before the supabase sign-out, while the session is still valid), so there is
  // no dedicated deactivation effect here.

  // A tap on the daily reminder opens Plans (or the one active plan), whether it
  // launched the app or arrived while it was running.
  useNotificationTapRouting();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Discreet mode's lock has a boundary of its own, so a failure anywhere else can
          never switch it off. It fails closed: a caught error locks a discreet install,
          and LoadingScreen then shows the lock screen. It is mounted at once rather than
          deferred; everything it imports is already on the startup path. */}
      <ErrorBoundary scope="privacy-lock" fallback={null} onError={lockAfterPrivacyLockFailure}>
        <PrivacyLockHost />
      </ErrorBoundary>
      {/* Outside the app boundary, a throw in a runtime-effects hook (sync, deep links)
          had no boundary at all and was a fatal crash. It renders nothing, so on failure
          it renders nothing and the app keeps running. */}
      <ErrorBoundary scope="runtime-effects" fallback={null}>
        <AppRuntimeEffectsHost enabled={onboardingCompleted && isPrivacyInitialized} />
      </ErrorBoundary>
      <ErrorBoundary>
        <LoadingScreen />
      </ErrorBoundary>
    </>
  );
}

function PrivacyLockHost() {
  usePrivacyLock();
  return null;
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
  privacyRetryShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  privacyRetryCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 24,
  },
  privacyRetryTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  privacyRetryBody: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
  },
  privacyRetryButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  privacyRetryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
