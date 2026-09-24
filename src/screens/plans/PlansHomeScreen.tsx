import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { TabSwitch } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useLocalToday } from '../../hooks/useLocalToday';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { lightHaptic, successHaptic } from '../../utils';
import type { PlansStackParamList } from '../../navigation/types';
import { unenrollFromPlan } from '../../services/plans/readingPlanService';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import {
  CompletedPlansSection,
  FindPlansSection,
  MyPlansSection,
  PLAN_TABS,
  PlansSkeleton,
  usePlansCatalog,
  usePlansProgress,
  type PlanTab,
} from './plansHome';

type NavigationProp = NativeStackNavigationProp<PlansStackParamList>;

export function PlansHomeScreen() {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { contentClearance } = useTabBarHeight();
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');
  // A rhythm's day is the calendar's; this re-renders on the new day even when the
  // screen was left showing overnight.
  const today = useLocalToday();

  const { allPlans, loading, refreshing, refresh } = usePlansCatalog();
  const { userProgress, activePlans, completedPlans, headerEyebrow } = usePlansProgress(allPlans);

  const handlePlanPress = useCallback(
    (planId: string) => {
      lightHaptic();
      navigation.navigate('PlanDetail', { planId });
    },
    [navigation]
  );

  const handleDeletePlan = useCallback(
    async (planId: string) => {
      const result = await unenrollFromPlan(planId);
      if (!result.success && result.error) {
        Alert.alert(t('common.error'), t('common.unexpectedError'));
        return;
      }
      successHaptic();
    },
    [t]
  );

  const handleAddPlan = useCallback(() => {
    lightHaptic();
    setActiveTab('find-plans');
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Three equal segments in one EL segmented control, kept in the sticky header
  // so the display title can scroll away without the switch ever leaving.
  const tabStrip = (
    <View style={styles.tabSticky}>
      <TabSwitch
        fullWidth
        size="md"
        value={activeTab}
        onChange={(key) => setActiveTab(key as PlanTab)}
        accessibilityLabel={t('readingPlans.plans')}
        segments={PLAN_TABS.map((tab) => ({
          key: tab.key,
          label: t(tab.labelKey as Parameters<typeof t>[0]),
        }))}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentClearance }}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accentPrimary}
          />
        }
      >
        <View style={styles.header}>
          {headerEyebrow ? (
            <Text style={[styles.headerEyebrow, displayFont.regular]} numberOfLines={2}>
              {headerEyebrow}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={[styles.title, displayFont.bold]}
          >
            {t('readingPlans.plans')}
          </Text>
        </View>
        {tabStrip}

        {loading && allPlans.length === 0 ? (
          <PlansSkeleton />
        ) : (
          <>
            {activeTab === 'my-plans' && (
              <MyPlansSection
                activePlans={activePlans}
                onAddPlan={handleAddPlan}
                onPlanPress={handlePlanPress}
                onDeletePlan={handleDeletePlan}
                today={today}
              />
            )}
            {activeTab === 'find-plans' && (
              <FindPlansSection
                allPlans={allPlans}
                userProgress={userProgress}
                onPlanPress={handlePlanPress}
                today={today}
              />
            )}
            {activeTab === 'completed' && (
              <CompletedPlansSection
                completedPlans={completedPlans}
                onPlanPress={handlePlanPress}
                onDeletePlan={handleDeletePlan}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    headerEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    title: {
      // Screen title, not reading copy — the EL display face, matching Home,
      // More and Settings.
      ...typography.displayHero,
      color: colors.primaryText,
    },
    tabSticky: {
      backgroundColor: colors.background,
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.md,
    },
  });
