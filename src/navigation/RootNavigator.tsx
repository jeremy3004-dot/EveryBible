import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { rootNavigationRef } from './rootNavigation';
import { navigationTypography } from '../design/system';
import { linkingConfig } from './linkingConfig';

export function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      linking={linkingConfig}
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
    </NavigationContainer>
  );
}
