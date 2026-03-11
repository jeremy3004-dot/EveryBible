import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RootTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { BibleStack } from './BibleStack';
import { LearnStack } from './LearnStack';
import { MoreStack } from './MoreStack';
import { useTheme } from '../contexts/ThemeContext';
import { rootTabManifest } from './tabManifest';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function TabNavigator() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 8,
          height: 65,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
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
        options={{ tabBarLabel: t('tabs.harvest') }}
      />
      <Tab.Screen name="More" component={MoreStack} options={{ tabBarLabel: t('tabs.more') }} />
    </Tab.Navigator>
  );
}
