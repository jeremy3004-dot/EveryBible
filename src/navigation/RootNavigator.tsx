import { useCallback, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { rootNavigationRef } from './rootNavigation';
import { navigationTypography } from '../design/system';
import { linkingConfig } from './linkingConfig';
import { AudioReturnTab } from '../components/audio/AudioReturnTab';
import { getCurrentRouteName } from '../components/audio/miniPlayerModel';

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const syncCurrentRouteName = useCallback(() => {
    const nextRouteName = getCurrentRouteName(rootNavigationRef.getRootState());
    setCurrentRouteName((current) => (current === nextRouteName ? current : nextRouteName));
  }, []);

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      linking={linkingConfig}
      onReady={syncCurrentRouteName}
      onStateChange={syncCurrentRouteName}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.tabActive,
          background: colors.background,
          card: colors.cardBackground,
          text: colors.primaryText,
          border: colors.cardBorder,
          notification: colors.accentGreen,
        },
        fonts: navigationTypography,
      }}
    >
      <TabNavigator />
      <AudioReturnTab currentRouteName={currentRouteName} />
    </NavigationContainer>
  );
}
