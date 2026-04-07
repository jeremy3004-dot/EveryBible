import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';

type PlanTab = 'my-plans' | 'find-plans' | 'saved' | 'completed';

export function PlansHomeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');

  const tabs: { key: PlanTab; labelKey: string }[] = [
    { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
    { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
    { key: 'saved', labelKey: 'readingPlans.saved' },
    { key: 'completed', labelKey: 'readingPlans.completed' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[typography.screenTitle, styles.title, { color: colors.primaryText }]}>
        {t('readingPlans.title')}
      </Text>
      {/* Segmented tab control */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tabPill,
              activeTab === tab.key
                ? { backgroundColor: colors.accentPrimary }
                : { borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? colors.cardBackground : colors.secondaryText },
              ]}
            >
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Placeholder content — replaced in Plan 18-03 */}
      <View style={styles.placeholder}>
        <Text style={[styles.placeholderText, { color: colors.secondaryText }]}>{activeTab}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tabRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  tabPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  tabLabel: {
    ...typography.label,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.body,
  },
});
