import { useCallback, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { rootNavigationRef } from './rootNavigation';
import { navigationTypography } from '../design/system';
import { flushParkedLink, linkingConfig } from './linkingConfig';
import { AudioReturnTab } from '../components/audio/AudioReturnTab';
import { getCurrentRouteName } from '../components/audio/miniPlayerModel';
import { usePrivacyLockNavigationState } from '../hooks/usePrivacyLockNavigationState';

const readRootState = () =>
  rootNavigationRef.isReady() ? rootNavigationRef.getRootState() : undefined;

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  // Reopens where the reader was after the discreet-mode lock unmounted this navigator.
  const { initialState, rememberState } = usePrivacyLockNavigationState();
  const syncCurrentRouteName = useCallback(() => {
    const rootState = readRootState();
    rememberState(rootState);
    const nextRouteName = getCurrentRouteName(rootState);
    setCurrentRouteName((current) => (current === nextRouteName ? current : nextRouteName));
  }, [rememberState]);
  const handleReady = useCallback(() => {
    syncCurrentRouteName();
    flushParkedLink();
  }, [syncCurrentRouteName]);

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      initialState={initialState}
      linking={linkingConfig}
      onReady={handleReady}
      onStateChange={syncCurrentRouteName}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.tabActive,
          background: colors.background,
          card: colors.cardBackground,
          text: colors.primaryText,
          border: colors.cardBorder,
          notification: colors.accentPrimary,
        },
        fonts: navigationTypography,
      }}
    >
      <TabNavigator />
      <AudioReturnTab currentRouteName={currentRouteName} />
    </NavigationContainer>
  );
}
