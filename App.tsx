import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import { openAuthFlow, type PendingAuthMode } from './src/navigation/rootNavigation';
import { initBibleData } from './src/services/bible/bibleService';
import { useAuthStore } from './src/stores/authStore';
import { usePrivacyStore } from './src/stores/privacyStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PrivacyLockScreen } from './src/components/privacy/PrivacyLockScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { usePrivacyLock } from './src/hooks/usePrivacyLock';
import { useSync } from './src/hooks/useSync';
import i18n, { changeLanguage } from './src/i18n';
import { LocaleSetupFlow } from './src/screens/onboarding/LocaleSetupFlow';
import { createStartupCoordinator } from './src/services/startup';

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.error('Failed to keep splash screen visible:', error);
});

interface LoadingScreenProps {
  onInitialAuthRequest: (mode: PendingAuthMode | null) => void;
}

function LoadingScreen({ onInitialAuthRequest }: LoadingScreenProps) {
  const { colors } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [shouldRenderNavigator, setShouldRenderNavigator] = useState(false);
  const warmupCancelRef = useRef<(() => void) | null>(null);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializePrivacy = usePrivacyStore((state) => state.initialize);
  const isPrivacyLocked = usePrivacyStore((state) => state.isLocked);
  const preferences = useAuthStore((state) => state.preferences);
  const startupCoordinator = useMemo(
    () =>
      createStartupCoordinator({
        initializeAuth,
        initializePrivacy,
        preloadBibleData: initBibleData,
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
    [initializeAuth, initializePrivacy]
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

  if (!isReady) {
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

  const { RootNavigator } = require('./src/navigation/RootNavigator') as typeof import('./src/navigation/RootNavigator');

  return <RootNavigator />;
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const onboardingCompleted = useAuthStore((state) => state.preferences.onboardingCompleted);
  const pendingInitialAuthModeRef = useRef<PendingAuthMode | null>(null);
  const onboardingCompletedRef = useRef(onboardingCompleted);
  useSync();
  usePrivacyLock();

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
});
