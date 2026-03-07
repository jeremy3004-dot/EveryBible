import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, InteractionManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider, useTranslation } from 'react-i18next';
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
SplashScreen.preventAutoHideAsync();

const loadingIcon = require('./assets/icon.png');

function LoadingScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loadingStatus, setLoadingStatus] = useState('loading.initializing');
  const [isReady, setIsReady] = useState(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setLoadingStatus('loading.settingUp');
        await startupCoordinator.initializeCritical();
        setLoadingStatus('loading.ready');
      } catch (error) {
        console.error('Failed to initialize:', error);
        setLoadingStatus('loading.errorLoading');
      } finally {
        // Hide the native splash screen
        await SplashScreen.hideAsync();
        // Small delay to show app loading screen briefly
        readyTimerRef.current = setTimeout(() => {
          if (isMounted) {
            setIsReady(true);
          }
        }, 300);
      }
    }

    void initialize();

    return () => {
      isMounted = false;
      if (warmupCancelRef.current) {
        warmupCancelRef.current();
        warmupCancelRef.current = null;
      }
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
      }
    };
  }, [startupCoordinator]);

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
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.loadingIconFrame,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Image source={loadingIcon} style={styles.loadingIcon} resizeMode="cover" />
        </View>
        <Text style={[styles.appName, { color: colors.primaryText }]}>Every Bible</Text>
        <ActivityIndicator size="large" color={colors.accentGreen} style={styles.spinner} />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
          {t(loadingStatus)}
        </Text>
      </View>
    );
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingIconFrame: {
    width: 132,
    height: 132,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
  },
  loadingIcon: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
});
