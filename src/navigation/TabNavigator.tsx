import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ViewStyle } from 'react-native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BookOpen, Calendar, Ellipsis, House, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { PlatformPressable } from '@react-navigation/elements';
import { useReaderChromeProgress } from '../stores/readerChromeStore';
import {
  getReaderTabBarTranslation,
  isReaderTabBarScrollHidden,
  shouldFollowReaderScroll,
} from './readerTabBarMotion';
import { TabBarSelection } from './TabBarSelection';
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
import type { RootTabIconName } from './tabManifest';
import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';
import { buildTabBarCapsuleStyle } from './tabBarCapsuleStyle';
import { typography } from '../design/system';
import { useTabBarHeight, TAB_BAR_CAPSULE_RADIUS } from '../hooks';
import { lightHaptic } from '../utils';

// Lucide ships one stroke weight per glyph, so the selected state is carried by
// the sliding accent pill behind the icon rather than a filled variant.
const TAB_BAR_ICON_SIZE = 22;
const TAB_BAR_ICON_STROKE_WIDTH = 2;

// Binds each glyph the manifest names to its Lucide component.
const TAB_BAR_ICONS: Record<RootTabIconName, LucideIcon> = {
  house: House,
  'book-open': BookOpen,
  users: Users,
  calendar: Calendar,
  ellipsis: Ellipsis,
};

function TabBarIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return <Icon size={TAB_BAR_ICON_SIZE} color={color} strokeWidth={TAB_BAR_ICON_STROKE_WIDTH} />;
}

// Liquid glass capsule. Native glass supplies its own material on iOS 26+;
// older platforms get a tinted blur so the page still shows through. The
// tint is the paper colour at partial alpha so the bar belongs to the scope.
function TabBarBackground({
  isDark,
  fill,
  stroke,
}: {
  isDark: boolean;
  fill: string;
  stroke: string;
}) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle="clear"
        colorScheme={isDark ? 'dark' : 'light'}
        style={styles.capsule}
      />
    );
  }
  return (
    <View style={styles.capsule} pointerEvents="none">
      <BlurView
        intensity={Platform.OS === 'ios' ? 40 : 24}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <View style={[StyleSheet.absoluteFill, styles.capsuleStroke, { borderColor: stroke }]} />
    </View>
  );
}

// Hex -> rgba, so a theme token can carry the capsule's translucency and the
// neutral selection pill without a second palette entry per scope.
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return hex;
  }
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

// Keep React Navigation semantics, test IDs, links, and all press callbacks intact.
function TabBarButton(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable {...props} style={[props.style, styles.tabButton]}>
      <View style={styles.tabContent}>{props.children}</View>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
    overflow: 'hidden',
  },
  capsuleStroke: {
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabItem: {
    height: '100%',
    paddingTop: 0,
    paddingBottom: 0,
  },
  // EL tab labels are a notch smaller than the shared tabLabel token so the
  // glyph and label both sit inside the 52pt selection pill.
  tabLabel: {
    ...typography.tabLabel,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});

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

function ReaderAwareTabBar(props: BottomTabBarProps) {
  const progress = useReaderChromeProgress();
  const [scrollHidden, setScrollHidden] = useState(false);
  const { colors } = useTheme();
  const activeRoute = props.state.routes[props.state.index];
  const { nestedRouteName, nestedRouteParams } = resolveActiveNestedRoute(
    activeRoute as { state?: NestedTabRouteState; params?: NestedTabRouteParams }
  );
  const followsReader = shouldFollowReaderScroll(
    activeRoute.name,
    nestedRouteName,
    nestedRouteParams
  );
  const descriptor = props.descriptors[activeRoute.key];
  const tabBarStyle = StyleSheet.flatten(descriptor.options.tabBarStyle) as ViewStyle | undefined;
  // setOptions still owns explicit hidden/modal states. Its transform must not
  // receive a second scroll translation from this wrapper.
  const hasExplicitTranslation =
    Array.isArray(tabBarStyle?.transform) &&
    tabBarStyle.transform.some(
      (transform) => 'translateY' in transform && transform.translateY !== 0
    );
  const followsScroll = followsReader && !hasExplicitTranslation;
  const forcedHidden =
    shouldHideTabBarOnNestedRoute(nestedRouteName, nestedRouteParams) ||
    tabBarStyle?.display === 'none' ||
    (Array.isArray(tabBarStyle?.transform) &&
      tabBarStyle.transform.some(
        (transform) =>
          'translateY' in transform &&
          typeof transform.translateY === 'number' &&
          transform.translateY >= getReaderTabBarTranslation(0.98)
      ));
  useAnimatedReaction(
    () => isReaderTabBarScrollHidden(followsScroll, progress.value),
    (hidden, previous) => {
      // Only the visibility boundary crosses to JS, never per-frame progress.
      if (hidden !== previous) {
        runOnJS(setScrollHidden)(hidden);
      }
    }
  );
  const interactionHidden = forcedHidden || (followsScroll && scrollHidden);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: followsScroll ? getReaderTabBarTranslation(progress.value) : 0 }],
  }));
  const originalBackground = descriptor.options.tabBarBackground;
  // The selected tab is a neutral ink pill — the scope's own text colour at a
  // low alpha — so the accent stays reserved for content, not chrome.
  const isReader = activeRoute.name === 'Bible' && nestedRouteName === 'BibleReader';
  const pillColor = withAlpha(isReader ? colors.biblePrimaryText : colors.primaryText, 0.1);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animatedStyle]}
      pointerEvents={interactionHidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={interactionHidden}
      importantForAccessibility={interactionHidden ? 'no-hide-descendants' : 'auto'}
    >
      <BottomTabBar
        {...props}
        descriptors={{
          ...props.descriptors,
          [activeRoute.key]: {
            ...descriptor,
            options: {
              ...descriptor.options,
              tabBarBackground: () => (
                <>
                  {originalBackground?.()}
                  <TabBarSelection
                    selectedIndex={props.state.index}
                    count={props.state.routes.length}
                    color={pillColor}
                  />
                </>
              ),
            },
          },
        }}
      />
    </Animated.View>
  );
}

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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  // Translucent paper tint over the glass. The reader variant tints off the
  // reading surface so the bar sits on the same material as the page behind it.
  const capsuleFill = useMemo(
    () => withAlpha(colors.cardBackground, 0.62),
    [colors.cardBackground]
  );
  const readerCapsuleFill = useMemo(
    () => withAlpha(colors.bibleSurface, 0.62),
    [colors.bibleSurface]
  );
  const {
    bottomPadding: tabBarBottomPadding,
    barHeight: tabBarBarHeight,
    sideInset: tabBarSideInset,
  } = useTabBarHeight();

  // Geometry changes with insets; UI-thread scroll motion never rebuilds it.
  const defaultTabBarStyle = useMemo(
    () =>
      buildTabBarCapsuleStyle({
        sideInset: tabBarSideInset,
        bottomPadding: tabBarBottomPadding,
        barHeight: tabBarBarHeight,
      }),
    [tabBarSideInset, tabBarBottomPadding, tabBarBarHeight]
  );
  // The reader shares the capsule geometry — only the paper it is filled with is
  // retinted, via tabBarBackground below.
  const readerTabBarStyle = defaultTabBarStyle;
  const getCollapsingTabBarStyle = useCallback(
    (collapseProgress: number) =>
      buildTabBarCapsuleStyle({
        sideInset: tabBarSideInset,
        bottomPadding: tabBarBottomPadding,
        barHeight: tabBarBarHeight,
        collapseProgress,
      }),
    [tabBarSideInset, tabBarBottomPadding, tabBarBarHeight]
  );

  return (
    <Tab.Navigator
      id="RootTab"
      tabBar={(props) => <ReaderAwareTabBar {...props} />}
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
            (route.name === 'Bible' ||
              route.name === 'Learn' ||
              route.name === 'Plans' ||
              route.name === 'More') &&
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
            : isBibleReader
              ? readerTabBarStyle
              : defaultTabBarStyle;
        })();

        return {
          headerShown: false,
          freezeOnBlur: true,
          // The selected glyph sits on a neutral ink pill, so it reads in the
          // scope's primary text rather than the accent.
          tabBarActiveTintColor: isBibleReader ? colors.biblePrimaryText : colors.primaryText,
          tabBarInactiveTintColor: isBibleReader ? colors.bibleSecondaryText : colors.secondaryText,
          tabBarStyle,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
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
          tabBarIcon: ({ color }) => {
            const tab = rootTabManifest.find((entry) => entry.name === route.name);

            if (!tab) {
              return null;
            }

            return <TabBarIcon icon={TAB_BAR_ICONS[tab.iconName]} color={color} />;
          },
        };
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{ tabBarLabel: t('tabs.home') }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tab.Screen
        name="Bible"
        component={BibleStack}
        options={{ tabBarLabel: t('tabs.bible') }}
        listeners={({ navigation, route }) => ({
          tabPress: (event) => {
            lightHaptic();
            const bibleRouteState = route as {
              state?: NestedTabRouteState;
              params?: NestedTabRouteParams;
            };
            const focusedRoute = bibleRouteState.state?.routes?.[bibleRouteState.state.index ?? 0];
            const nestedRouteName = focusedRoute?.name ?? bibleRouteState.params?.screen;
            const nestedRouteParams = focusedRoute?.params ?? bibleRouteState.params?.params;
            const isPlanSessionReader =
              nestedRouteName === 'BibleReader' && typeof nestedRouteParams?.planId === 'string';
            const { hasReaderHistory, currentBibleBook, currentBibleChapter, preferredBibleMode } =
              getBibleTabResumeState();
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
      <Tab.Screen
        name="Learn"
        component={LearnStack}
        options={{ tabBarLabel: t('tabs.gather') }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tab.Screen
        name="Plans"
        component={PlansStack}
        options={{ tabBarLabel: t('tabs.plans') }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            lightHaptic();
            event.preventDefault();
            navigation.navigate('Plans', {
              screen: 'PlansHome',
            });
          },
        })}
      />
      <Tab.Screen
        name="More"
        component={MoreStack}
        options={{ tabBarLabel: t('tabs.more') }}
        listeners={{ tabPress: () => lightHaptic() }}
      />
    </Tab.Navigator>
  );
}
