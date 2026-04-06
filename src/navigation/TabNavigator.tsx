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
import { useBibleStore } from '../stores/bibleStore';

const Tab = createBottomTabNavigator<RootTabParamList>();

type NestedTabRouteState = {
  index?: number;
  routes?: Array<{
    name: string;
    params?: Record<string, unknown>;
  }>;
};

export function TabNavigator() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hasReaderHistory = useBibleStore((state) => state.hasReaderHistory);
  const currentBibleBook = useBibleStore((state) => state.currentBook);
  const currentBibleChapter = useBibleStore((state) => state.currentChapter);
  const preferredBibleMode = useBibleStore((state) => state.preferredChapterLaunchMode);
  const tabBarBottomPadding = spacing.lg;
  const tabBarHeight = layout.tabBarBaseHeight + tabBarBottomPadding;
  const defaultTabBarStyle = {
    backgroundColor: colors.background,
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    paddingTop: 0,
    paddingBottom: tabBarBottomPadding + spacing.sm,
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

          return shouldHideNestedBibleScreen ? { display: 'none' } : defaultTabBarStyle;
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
      <Tab.Screen
        name="Bible"
        component={BibleStack}
        options={{ tabBarLabel: t('tabs.bible') }}
        listeners={({ navigation, route }) => ({
          tabPress: (event) => {
            const bibleRouteState = route as {
              state?: NestedTabRouteState;
            };
            const focusedRoute =
              bibleRouteState.state?.routes?.[bibleRouteState.state.index ?? 0];
            const shouldResumeReader =
              hasReaderHistory && focusedRoute?.name !== 'BibleReader';

            if (!shouldResumeReader) {
              return;
            }

            event.preventDefault();
            navigation.navigate('Bible', {
              screen: 'BibleReader',
              params: {
                bookId: currentBibleBook,
                chapter: currentBibleChapter,
                preferredMode: preferredBibleMode,
              },
            });
          },
        })}
      />
      <Tab.Screen
        name="Learn"
        component={LearnStack}
        options={{ tabBarLabel: t('tabs.gather') }}
      />
      <Tab.Screen name="More" component={MoreStack} options={{ tabBarLabel: t('tabs.more') }} />
    </Tab.Navigator>
  );
}
