import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RootTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { BibleStack } from './BibleStack';
import { LearnStack } from './LearnStack';
import { MoreStack } from './MoreStack';
import { useTheme } from '../contexts/ThemeContext';
import { rootTabManifest } from './tabManifest';
import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';
import { layout, spacing, typography } from '../design/system';

const Tab = createBottomTabNavigator<RootTabParamList>();

type NestedTabRouteState = {
  index?: number;
  routes?: Array<{
    name: string;
    params?: {
      tabBarVisible?: boolean;
    };
  }>;
};

function shouldKeepBibleTabBarVisible(route: {
  name: string;
  state?: NestedTabRouteState;
}): boolean {
  if (route.name !== 'Bible') {
    return true;
  }

  const focusedRoute = route.state?.routes?.[route.state.index ?? 0];
  if (focusedRoute?.name !== 'BibleReader') {
    return true;
  }

  return focusedRoute.params?.tabBarVisible !== false;
}

export function TabNavigator() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tabBarBottomPadding = spacing.md;
  const tabBarHeight = layout.tabBarBaseHeight + tabBarBottomPadding;
  const defaultTabBarStyle = {
    backgroundColor: colors.background,
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingBottom: tabBarBottomPadding,
    height: tabBarHeight,
  } as const;

  return (
    <Tab.Navigator
      id="RootTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: (() => {
          if (route.name === 'Home') {
            return defaultTabBarStyle;
          }

          const shouldHideNestedBibleScreen =
            (route.name === 'Bible' || route.name === 'Learn') &&
            shouldHideTabBarOnNestedRoute(getFocusedRouteNameFromRoute(route));
          const shouldHideBibleReaderTabBar =
            route.name === 'Bible' &&
            !shouldKeepBibleTabBarVisible(route as {
              name: string;
              state?: NestedTabRouteState;
            });

          return shouldHideNestedBibleScreen || shouldHideBibleReaderTabBar
            ? { display: 'none' }
            : defaultTabBarStyle;
        })(),
        tabBarLabelStyle: typography.tabLabel,
        tabBarItemStyle: {
          paddingTop: spacing.xs,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const tab = rootTabManifest.find((entry) => entry.name === route.name);
          const iconName = focused ? tab?.focusedIcon : tab?.unfocusedIcon;

          if (!iconName) {
            return null;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ tabBarLabel: t('tabs.home') }} />
      <Tab.Screen name="Bible" component={BibleStack} options={{ tabBarLabel: t('tabs.bible') }} />
      <Tab.Screen
        name="Learn"
        component={LearnStack}
        options={{ tabBarLabel: t('tabs.gather') }}
      />
      <Tab.Screen name="More" component={MoreStack} options={{ tabBarLabel: t('tabs.more') }} />
    </Tab.Navigator>
  );
}
