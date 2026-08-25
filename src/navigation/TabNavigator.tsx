import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
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
import { buildTabBarCapsuleStyle } from './tabBarCapsuleStyle';
import { motion, typography } from '../design/system';
import { useTabBarHeight, TAB_BAR_CAPSULE_RADIUS } from '../hooks';
import { lightHaptic } from '../utils';

// Bottom-tab icon. The selected state is carried by the pill drawn in
// TabBarButton below, so the icon itself no longer scales on focus.
function TabBarIcon({
  name,
  size,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

// The frosted capsule behind the whole bar. expo-blur gives the real material;
// the tint layer above it keeps the capsule legible when the blur is weak (or
// unavailable, as on some Android builds) and carries the hairline edge.
function TabBarBackground({ isDark, fill, stroke }: { isDark: boolean; fill: string; stroke: string }) {
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

// One tab. The accent pill wraps the icon AND the label — the reference sizes it
// at roughly the full item width by the full capsule height less a small inset,
// so it reads as a selected segment rather than a badge behind the glyph.
function TabBarButton({
  focused,
  pillColor,
  onPress,
  onLongPress,
  accessibilityLabel,
  children,
}: {
  focused: boolean;
  pillColor: string;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, motion.spring);
  }, [focused, reduceMotion, progress]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Pressable
      style={styles.tabButton}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
    >
      <View style={styles.tabPillWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.tabPill, { backgroundColor: pillColor }, animatedStyle]}
        />
        <View style={styles.tabContent}>{children}</View>
      </View>
    </Pressable>
  );
}

const TAB_PILL_HEIGHT = 52;

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
  tabPillWrap: {
    alignSelf: 'stretch',
    marginHorizontal: 2,
    height: TAB_PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_PILL_HEIGHT / 2,
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
});

// Hex -> rgba, so a theme token can carry the capsule's translucency without a
// second palette entry per scope.
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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const capsuleFill = useMemo(() => withAlpha(colors.cardBackground, 0.62), [colors.cardBackground]);
  const readerCapsuleFill = useMemo(
    () => withAlpha(colors.bibleSurface, 0.62),
    [colors.bibleSurface]
  );
  const {
    bottomPadding: tabBarBottomPadding,
    barHeight: tabBarBarHeight,
    sideInset: tabBarSideInset,
  } = useTabBarHeight();

  // These style objects are static per theme/inset change, so build them once
  // instead of on every screenOptions invocation (fires on each nav event, and
  // repeatedly during reader scroll-collapse ticks). Visual values (absolute
  // positioning, spacing.xs bottom padding) come from the polish pass.
  const defaultTabBarStyle = useMemo(
    () =>
      buildTabBarCapsuleStyle({
        sideInset: tabBarSideInset,
        bottomPadding: tabBarBottomPadding,
        barHeight: tabBarBarHeight,
      }),
    [tabBarSideInset, tabBarBottomPadding, tabBarBarHeight]
  );
  // The reader shares the capsule geometry — only the blurred background it sits
  // on is retinted, via tabBarBackground below.
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
            ? getCollapsingTabBarStyle(tabBarCollapseProgress)
            : isBibleReader
              ? readerTabBarStyle
              : defaultTabBarStyle;
        })();

        return {
          headerShown: false,
          freezeOnBlur: true,
          // The selected tab always sits on the accent surface, so its glyph is
          // always the accent foreground. Tinting it with the reader's text
          // colour (the rule from when the reader retinted the whole bar) made
          // the Bible tab render near-black on the pale-blue pill in vellum.
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: isBibleReader ? colors.bibleSecondaryText : colors.tabInactive,
          tabBarStyle,
          tabBarLabelStyle: typography.tabLabel,
          tabBarItemStyle: styles.tabItem,
          // The frosted capsule. In the reader it tints off the reading surface
          // so the bar sits on the same material as the page behind it.
          tabBarBackground: () => (
            <TabBarBackground
              isDark={isDark}
              fill={isBibleReader ? readerCapsuleFill : capsuleFill}
              stroke={isBibleReader ? colors.bibleDivider : colors.cardBorder}
            />
          ),
          // React Navigation v7 reports selection as `aria-selected`, not
          // `accessibilityState.selected` — reading the latter leaves the pill
          // permanently at opacity 0.
          tabBarButton: (props: BottomTabBarButtonProps) => (
            <TabBarButton
              focused={props['aria-selected'] ?? false}
              pillColor={colors.accentSurface}
              onPress={props.onPress as (() => void) | undefined}
              onLongPress={props.onLongPress as (() => void) | undefined}
              accessibilityLabel={props['aria-label']}
            >
              {props.children}
            </TabBarButton>
          ),
          tabBarIcon: ({ focused, color, size }) => {
            const tab = rootTabManifest.find((entry) => entry.name === route.name);
            const iconName = focused ? tab?.focusedIcon : tab?.unfocusedIcon;

            if (!iconName) {
              return null;
            }

            return <TabBarIcon name={iconName} size={size} color={color} />;
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
