import { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppCard, EmptyState, SectionHeader } from '../../../components/ui';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { getActivePlanDayNumber } from '../../../services/plans/readingPlanModel';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import { CatalogPlanRow } from './CatalogPlanRow';
import { getPlanCategoryLabel, groupCatalogPlans } from './plansHomeModel';
import { RhythmCard } from './RhythmCard';
import { usePlanCatalogSearch } from './usePlanCatalogSearch';

interface FindPlansSectionProps {
  allPlans: ReadingPlan[];
  userProgress: UserReadingPlanProgress[];
  onPlanPress: (planId: string) => void;
  today: Date;
}

/** The searchable catalog: Daily rhythms as a cover grid, every other category as rows. */
export function FindPlansSection({
  allPlans,
  userProgress,
  onPlanPress,
  today,
}: FindPlansSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { searchQuery, setSearchQuery, filteredPlans } = usePlanCatalogSearch(allPlans);
  const { dailyRhythmPlans, categories } = useMemo(
    () => groupCatalogPlans(filteredPlans),
    [filteredPlans]
  );
  const progressByPlanId = useMemo(
    () => new Map(userProgress.map((progress) => [progress.plan_id, progress])),
    [userProgress]
  );
  const searchLabel = t('readingPlans.searchPlansCount', { count: allPlans.length });

  return (
    <View style={styles.content}>
      <View style={styles.searchStrip}>
        <Search size={17} color={colors.secondaryText} strokeWidth={2} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={searchLabel}
          placeholderTextColor={colors.secondaryText}
          style={[styles.searchInput, { color: colors.primaryText }]}
          accessibilityLabel={searchLabel}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {dailyRhythmPlans.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title={t('readingPlans.dailyRhythms')}
            eyebrow={t('readingPlans.plansCount', { count: dailyRhythmPlans.length })}
            style={styles.sectionHeader}
          />
          <View style={styles.rhythmGrid}>
            {dailyRhythmPlans.map((plan) => (
              <RhythmCard
                key={plan.id}
                plan={plan}
                progress={progressByPlanId.get(plan.id)}
                today={today}
                onPlanPress={onPlanPress}
              />
            ))}
          </View>
        </View>
      ) : null}

      {categories.map(({ category, plans }) => (
        <View key={category} style={styles.section}>
          <SectionHeader
            title={getPlanCategoryLabel(category, t)}
            eyebrow={t('readingPlans.plansCount', { count: plans.length })}
            style={styles.sectionHeader}
          />
          <AppCard padding={0}>
            {plans.map((plan, index) => {
              const progress = progressByPlanId.get(plan.id);
              return (
                <CatalogPlanRow
                  key={plan.id}
                  plan={plan}
                  isEnrolled={progress !== undefined}
                  activeDayNumber={
                    progress ? getActivePlanDayNumber(plan, progress, today) : undefined
                  }
                  isFirst={index === 0}
                  onPlanPress={onPlanPress}
                />
              );
            })}
          </AppCard>
        </View>
      ))}

      {filteredPlans.length === 0 && (
        <EmptyState
          icon="search-outline"
          title={
            searchQuery.trim() ? t('readingPlans.noPlanSearchResults') : t('readingPlans.noPlans')
          }
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      gap: spacing.xl,
    },
    searchStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      // minHeight, not height: the query grows with the OS text size and a
      // fixed 44pt strip clipped its glyphs at accessibility sizes.
      minHeight: 44,
      borderWidth: 1,
      borderRadius: radius.lg,
      borderColor: colors.controlBorder,
      backgroundColor: colors.cardBackground,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      ...typography.body,
      fontSize: 14.5,
      flex: 1,
      paddingVertical: 0,
    },
    section: {
      gap: spacing.md,
    },
    sectionHeader: {
      marginTop: 6,
      marginBottom: 0,
    },
    rhythmGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
    },
  });
