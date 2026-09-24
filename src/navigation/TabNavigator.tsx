import React, { useCallback, useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { BibleStack } from './BibleStack';
import { LearnStack } from './LearnStack';
import { PlansStack } from './PlansStack';
import { MoreStack } from './MoreStack';
import { buildTabBarCapsuleStyle } from './tabBarCapsuleStyle';
import { ReaderAwareTabBar } from './tabNavigatorParts/ReaderAwareTabBar';
import {
  getBibleTabResumeParams,
  type BibleTabResumeState,
  type TabRoute,
} from './tabNavigatorParts/tabNavigatorModel';
import { useTabScreenOptions } from './tabNavigatorParts/useTabScreenOptions';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { lightHaptic } from '../utils/haptics';

// The app shell renders this navigator at boot. Its tab bar (glass capsule,
// reader-scroll motion, selection pill) and screen options live in ./tabNavigatorParts.

const Tab = createBottomTabNavigator<RootTabParamList>();

function getBibleTabResumeState(): BibleTabResumeState {
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

  // A fresh screenOptions closure per render makes React Navigation recompute
  // every tab's options; the reader drives this component often enough for that
  // to matter. Same for the tabBar renderer.
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <ReaderAwareTabBar {...props} />,
    []
  );
  const screenOptions = useTabScreenOptions({ defaultTabBarStyle, getCollapsingTabBarStyle });

  return (
    <Tab.Navigator id="RootTab" tabBar={renderTabBar} screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={HomeStack} listeners={{ tabPress: () => lightHaptic() }} />
      <Tab.Screen
        name="Bible"
        component={BibleStack}
        listeners={({ navigation, route }) => ({
          tabPress: (event) => {
            lightHaptic();
            const params = getBibleTabResumeParams(route as TabRoute, getBibleTabResumeState());
            if (!params) {
              return;
            }

            event.preventDefault();
            navigation.navigate('Bible', { screen: 'BibleReader', params });
          },
        })}
      />
      <Tab.Screen
        name="Learn"
        component={LearnStack}
        listeners={{ tabPress: () => lightHaptic() }}
      />
      <Tab.Screen
        name="Plans"
        component={PlansStack}
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
      <Tab.Screen name="More" component={MoreStack} listeners={{ tabPress: () => lightHaptic() }} />
    </Tab.Navigator>
  );
}
