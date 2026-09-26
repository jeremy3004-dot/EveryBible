import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { rootTabManifest } from '../tabManifest';
import { getTabBarCapsuleFill } from '../tabBarCapsuleStyle';
import { resolveTabNestedRoute } from './ReaderAwareTabBar';
import {
  TabBarBackground,
  TabBarButton,
  TabBarIcon,
  TabBarLabel,
  tabIconStyle,
  tabItemStyle,
} from './TabBarChrome';
import { getTabBarCollapseProgress, type TabRoute } from './tabNavigatorModel';

interface TabScreenOptionsInput {
  /** The shown capsule; the reader shares its geometry and only retints the paper. */
  defaultTabBarStyle: ViewStyle;
  getCollapsingTabBarStyle: (collapseProgress: number) => ViewStyle;
}

/**
 * The root tabs' screenOptions: capsule style (collapsed for screens that hide
 * the bar), ink and paper for the reader or the app, and the tab item parts.
 * Memoised, because a fresh closure makes React Navigation recompute every
 * tab's options and the reader re-renders the navigator often.
 */
export function useTabScreenOptions({
  defaultTabBarStyle,
  getCollapsingTabBarStyle,
}: TabScreenOptionsInput) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  // Paper backing for the glass. The reader variant tints off the reading
  // surface so the bar sits on the same material as the page behind it.
  const capsuleFill = useMemo(
    () => getTabBarCapsuleFill(colors.cardBackground),
    [colors.cardBackground]
  );
  const readerCapsuleFill = useMemo(
    () => getTabBarCapsuleFill(colors.bibleSurface),
    [colors.bibleSurface]
  );

  return useCallback(
    ({ route }: { route: { name: string } }) => {
      // Resolve the active nested route once per invocation rather than once per
      // tint/style callback below.
      const nestedRoute = resolveTabNestedRoute(route as TabRoute);
      const isBibleReader = route.name === 'Bible' && nestedRoute.nestedRouteName === 'BibleReader';
      const collapseProgress = getTabBarCollapseProgress(route.name, nestedRoute);
      const tabBarStyle =
        collapseProgress > 0 ? getCollapsingTabBarStyle(collapseProgress) : defaultTabBarStyle;

      const tab = rootTabManifest.find((entry) => entry.name === route.name);
      const tabLabel = tab ? t(tab.labelKey) : route.name;
      const tabIndex = rootTabManifest.findIndex((entry) => entry.name === route.name);
      // The selected glyph sits on a neutral ink pill, so it reads in the scope's
      // primary text rather than the accent. Inactive glyphs are full ink too; the
      // neutral pill alone carries selection.
      const ink = isBibleReader ? colors.biblePrimaryText : colors.primaryText;

      return {
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: ink,
        tabBarInactiveTintColor: ink,
        tabBarStyle,
        tabBarItemStyle: tabItemStyle,
        tabBarIconStyle: tabIconStyle,
        tabBarLabel: ({ color }: { color: string }) => (
          <TabBarLabel label={tabLabel} color={color} />
        ),
        // A function label makes BottomTabBar drop the positional announcement
        // it synthesizes for string labels on iOS; restate it so VoiceOver
        // users keep "Home, tab, 1 of 5".
        tabBarAccessibilityLabel:
          Platform.OS === 'ios' && tabIndex >= 0
            ? t('tabs.accessibilityPosition', {
                label: tabLabel,
                position: tabIndex + 1,
                total: rootTabManifest.length,
              })
            : tabLabel,
        // The glass capsule. In the reader it tints off the reading surface so
        // the bar sits on the same material as the page behind it.
        tabBarBackground: () => (
          <TabBarBackground
            isDark={isDark}
            fill={isBibleReader ? readerCapsuleFill : capsuleFill}
            stroke={isBibleReader ? colors.bibleDivider : colors.cardBorder}
          />
        ),
        tabBarButton: (props: BottomTabBarButtonProps) => <TabBarButton {...props} />,
        tabBarIcon: ({ color }: { color: string }) =>
          tab ? <TabBarIcon iconName={tab.iconName} color={color} /> : null,
      };
    },
    [
      capsuleFill,
      colors.bibleDivider,
      colors.biblePrimaryText,
      colors.cardBorder,
      colors.primaryText,
      defaultTabBarStyle,
      getCollapsingTabBarStyle,
      isDark,
      readerCapsuleFill,
      t,
    ]
  );
}
