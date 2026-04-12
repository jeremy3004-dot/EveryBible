import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RootTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { BibleStack } from './BibleStack';
import { LearnStack } from './LearnStack';
import { PlansStack } from './PlansStack';
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

type NestedTabRouteParams = {
  screen?: string;
  params?: Record<string, unknown>;
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
  const getCollapsingTabBarStyle = (collapseProgress: number) => ({
    backgroundColor: colors.background,
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 0,
    paddingBottom: tabBarBottomPadding + spacing.sm,
    height: tabBarHeight,
    transform: [{ translateY: tabBarHeight * collapseProgress }],
    opacity: 1 - collapseProgress,
  });

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

          const focusedNestedRoute = (
            route as {
              state?: NestedTabRouteState;
              params?: NestedTabRouteParams;
            }
          ).state?.routes?.[((
            route as {
              state?: NestedTabRouteState;
              params?: NestedTabRouteParams;
            }
          ).state?.index ?? 0)];
          const nestedRouteName =
            getFocusedRouteNameFromRoute(route) ??
            ((route as { params?: NestedTabRouteParams }).params?.screen as string | undefined);
          const nestedRouteParams =
            focusedNestedRoute?.params ??
            (route as { params?: NestedTabRouteParams }).params?.params;
          const shouldHideNestedBibleScreen =
            (route.name === 'Bible' || route.name === 'Learn' || route.name === 'Plans') &&
            shouldHideTabBarOnNestedRoute(nestedRouteName, nestedRouteParams);
          const routeCollapseProgress =
            typeof nestedRouteParams?.tabBarCollapseProgress === 'number'
              ? Math.max(0, Math.min(nestedRouteParams.tabBarCollapseProgress, 1))
              : 0;
          const tabBarCollapseProgress = shouldHideNestedBibleScreen
            ? Math.max(routeCollapseProgress, 1)
            : routeCollapseProgress;

          return tabBarCollapseProgress > 0
            ? getCollapsingTabBarStyle(tabBarCollapseProgress)
            : defaultTabBarStyle;
        })(),
        tabBarLabelStyle: typography.tabLabel,
        tabBarItemStyle: {
          paddingBottom: spacing.xs,
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
              params?: NestedTabRouteParams;
            };
            const focusedRoute =
              bibleRouteState.state?.routes?.[bibleRouteState.state.index ?? 0];
            const nestedRouteName =
              focusedRoute?.name ?? bibleRouteState.params?.screen;
            const nestedRouteParams =
              focusedRoute?.params ?? bibleRouteState.params?.params;
            const isPlanSessionReader =
              nestedRouteName === 'BibleReader' && typeof nestedRouteParams?.planId === 'string';
            const shouldResumeReader =
              hasReaderHistory &&
              (nestedRouteName !== 'BibleReader' || isPlanSessionReader);

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
                planId: undefined,
                planDayNumber: undefined,
                returnToPlanOnComplete: undefined,
                sessionContext: undefined,
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
      <Tab.Screen
        name="Plans"
        component={PlansStack}
        options={{ tabBarLabel: t('tabs.plans') }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate('Plans', {
              screen: 'PlansHome',
            });
          },
        })}
      />
      <Tab.Screen name="More" component={MoreStack} options={{ tabBarLabel: t('tabs.more') }} />
    </Tab.Navigator>
  );
}
