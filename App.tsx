import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import { initBibleData } from './src/services/bible';
import { useAuthStore, usePrivacyStore } from './src/stores';
import { ErrorBoundary, PrivacyLockScreen } from './src/components';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { usePrivacyLock, useSync } from './src/hooks';
import i18n, { changeLanguage } from './src/i18n';
import { LocaleSetupFlow } from './src/screens/onboarding';
import { createStartupCoordinator } from './src/services/startup';

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.error('Failed to keep splash screen visible:', error);
});

function LoadingScreen() {
  const [isReady, setIsReady] = useState(false);
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

  if (!isReady) {
    return null;
  }

  if (!preferences.onboardingCompleted) {
    return <LocaleSetupFlow mode="initial" />;
  }

  if (isPrivacyLocked) {
    return <PrivacyLockScreen />;
  }

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
  useSync();
  usePrivacyLock();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ErrorBoundary>
        <LoadingScreen />
      </ErrorBoundary>
    </>
  );
}
