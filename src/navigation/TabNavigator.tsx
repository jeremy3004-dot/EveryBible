import React, { useCallback, useMemo } from 'react';
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
import { spacing, typography } from '../design/system';
import { useTabBarHeight } from '../hooks';

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

// The exact route shape getFocusedRouteNameFromRoute accepts, derived from the
// function itself rather than casting through `never`.
type FocusedRouteArg = Parameters<typeof getFocusedRouteNameFromRoute>[0];

const resolveActiveNestedRoute = (route: {
  state?: NestedTabRouteState;
  params?: NestedTabRouteParams;
}) => {
  let currentRoute: {
    name?: string;
    params?: Record<string, unknown>;
    state?: NestedTabRouteState;
  } = route;
  let currentState = route.state;

  while (currentState?.routes?.length) {
    const currentIndex =
      typeof currentState.index === 'number' ? currentState.index : currentState.routes.length - 1;
    const nextRoute = currentState.routes[currentIndex];
    if (!nextRoute) {
      break;
    }

    currentRoute = nextRoute;
    currentState = (nextRoute as { state?: NestedTabRouteState }).state;
  }

  const fallbackNestedRouteName = route.params?.screen;
  const fallbackNestedRouteParams = route.params?.params;

  return {
    nestedRouteName:
      getFocusedRouteNameFromRoute(route as FocusedRouteArg) ??
      currentRoute.name ??
      fallbackNestedRouteName,
    nestedRouteParams: currentRoute.params ?? fallbackNestedRouteParams,
  };
};

function getBibleTabResumeState() {
  const { useBibleStore } =
    require('../stores/bibleStore') as typeof import('../stores/bibleStore');
  const state = useBibleStore.getState();

  return {
    hasReaderHistory: state.hasReaderHistory,
    currentBibleBook: state.currentBook,
    currentBibleChapter: state.currentChapter,
    preferredBibleMode: state.preferredChapterLaunchMode,
  };
}

export function TabNavigator() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { bottomPadding: tabBarBottomPadding, height: tabBarHeight } = useTabBarHeight();

  // These style objects are static per theme/inset change, so build them once
  // instead of on every screenOptions invocation (fires on each nav event, and
  // repeatedly during reader scroll-collapse ticks).
  const defaultTabBarStyle = useMemo(
    () =>
      ({
        backgroundColor: colors.background,
        borderTopColor: colors.cardBorder,
        borderTopWidth: 1,
        paddingTop: 0,
        paddingBottom: tabBarBottomPadding + spacing.sm,
        height: tabBarHeight,
      }) as const,
    [colors.background, colors.cardBorder, tabBarBottomPadding, tabBarHeight]
  );
  const readerTabBarStyle = useMemo(
    () =>
      ({
        ...defaultTabBarStyle,
        backgroundColor: colors.bibleBackground,
        borderTopColor: colors.bibleDivider,
      }) as const,
    [defaultTabBarStyle, colors.bibleBackground, colors.bibleDivider]
  );
  const getCollapsingTabBarStyle = useCallback(
    (collapseProgress: number, useReaderTheme = false) => ({
      backgroundColor: useReaderTheme ? colors.bibleBackground : colors.background,
      borderTopColor: useReaderTheme ? colors.bibleDivider : colors.cardBorder,
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
    }),
    [
      colors.bibleBackground,
      colors.background,
      colors.bibleDivider,
      colors.cardBorder,
      tabBarBottomPadding,
      tabBarHeight,
    ]
  );

  return (
    <Tab.Navigator
      id="RootTab"
      screenOptions={({ route }) => {
        // Resolve the active nested route once per invocation rather than three
        // times across the tint/style callbacks below.
        const nestedRouteState = route as {
          state?: NestedTabRouteState;
          params?: NestedTabRouteParams;
        };
        const { nestedRouteName, nestedRouteParams } = resolveActiveNestedRoute(nestedRouteState);
        const isBibleReader = route.name === 'Bible' && nestedRouteName === 'BibleReader';

        const tabBarStyle = (() => {
          if (route.name === 'Home') {
            return defaultTabBarStyle;
          }

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
            ? getCollapsingTabBarStyle(tabBarCollapseProgress, isBibleReader)
            : isBibleReader
              ? readerTabBarStyle
              : defaultTabBarStyle;
        })();

        return {
          headerShown: false,
          freezeOnBlur: true,
          tabBarActiveTintColor: isBibleReader ? colors.biblePrimaryText : colors.tabActive,
          tabBarInactiveTintColor: isBibleReader
            ? colors.bibleSecondaryText
            : colors.tabInactive,
          tabBarStyle,
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
        };
      }}
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
            const focusedRoute = bibleRouteState.state?.routes?.[bibleRouteState.state.index ?? 0];
            const nestedRouteName = focusedRoute?.name ?? bibleRouteState.params?.screen;
            const nestedRouteParams = focusedRoute?.params ?? bibleRouteState.params?.params;
            const isPlanSessionReader =
              nestedRouteName === 'BibleReader' && typeof nestedRouteParams?.planId === 'string';
            const {
              hasReaderHistory,
              currentBibleBook,
              currentBibleChapter,
              preferredBibleMode,
            } = getBibleTabResumeState();
            const shouldResumeReader =
              hasReaderHistory && (nestedRouteName !== 'BibleReader' || isPlanSessionReader);

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
      <Tab.Screen name="Learn" component={LearnStack} options={{ tabBarLabel: t('tabs.gather') }} />
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
