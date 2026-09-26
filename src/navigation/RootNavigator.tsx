import { useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { rootNavigationRef } from './rootNavigation';
import { navigationTypography } from '../design/system';
import { flushParkedLink, linkingConfig } from './linkingConfig';
import { usePrivacyLockNavigationState } from '../hooks/usePrivacyLockNavigationState';

const readRootState = () =>
  rootNavigationRef.isReady() ? rootNavigationRef.getRootState() : undefined;

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  // Reopens where the reader was after the discreet-mode lock unmounted this navigator.
  const { initialState, rememberState } = usePrivacyLockNavigationState();
  const rememberRootState = useCallback(() => {
    rememberState(readRootState());
  }, [rememberState]);
  const handleReady = useCallback(() => {
    rememberRootState();
    flushParkedLink();
  }, [rememberRootState]);

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      initialState={initialState}
      linking={linkingConfig}
      onReady={handleReady}
      onStateChange={rememberRootState}
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
      {/* The player now lives in the tab bar itself (see playerBar/PlayerBar). */}
      <TabNavigator />
    </NavigationContainer>
  );
}
