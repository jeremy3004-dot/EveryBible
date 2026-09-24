import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { EmptyState, SectionHeader } from '../../../components/ui';
import { layout, spacing } from '../../../design/system';
import type { ReadingPlan, UserReadingPlanProgress } from '../../../services/plans/types';
import type { ListeningHistoryEntry } from '../../../stores/libraryModel';
import { ActivePlanCard } from './ActivePlanCard';
import { getActivePlanRows, splitActivePlanRows, type ActivePlanRow } from './plansHomeModel';

interface MyPlansSectionProps {
  allPlans: ReadingPlan[];
  userProgress: UserReadingPlanProgress[];
  chaptersRead: Record<string, number>;
  listeningHistory: ListeningHistoryEntry[];
  onAddPlan: () => void;
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  /** The local "now" a recurring plan's day and today's activity are read against. */
  today: Date;
}

/** The reader's unfinished plans, as Daily readings and Daily rhythms. */
export function MyPlansSection({
  allPlans,
  userProgress,
  chaptersRead,
  listeningHistory,
  onAddPlan,
  onPlanPress,
  onDeletePlan,
  today,
}: MyPlansSectionProps) {
  const { t } = useTranslation();
  const activePlans = useMemo(
    () => getActivePlanRows(allPlans, userProgress),
    [allPlans, userProgress]
  );
  const { dailyReadings, dailyRhythms } = useMemo(
    () => splitActivePlanRows(activePlans),
    [activePlans]
  );

  // Nothing started yet: show the empty state alone. A section header above an
  // empty list reads as a broken section, so no headers render in this state.
  if (activePlans.length === 0) {
    return (
      <View style={styles.content}>
        <EmptyState
          icon="book-outline"
          title={t('readingPlans.noActivePlans')}
          body={t('readingPlans.noActivePlansBody')}
          cta={{ label: t('readingPlans.addFirstPlan'), onPress: onAddPlan }}
        />
      </View>
    );
  }

  const renderGroup = (title: string, rows: ActivePlanRow[]) =>
    rows.length > 0 ? (
      <View style={styles.sectionBlock}>
        <SectionHeader
          title={title}
          eyebrow={t('readingPlans.plansCount', { count: rows.length })}
          style={styles.sectionHeader}
        />
        {rows.map((row) => (
          <ActivePlanCard
            key={row.plan.id}
            row={row}
            chaptersRead={chaptersRead}
            listeningHistory={listeningHistory}
            today={today}
            onPlanPress={onPlanPress}
            onDeletePlan={onDeletePlan}
          />
        ))}
      </View>
    ) : null;

  return (
    <View style={styles.content}>
      {renderGroup(t('readingPlans.dailyReadings'), dailyReadings)}
      {renderGroup(t('readingPlans.dailyRhythms'), dailyRhythms)}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  sectionBlock: {
    gap: spacing.md,
  },
  sectionHeader: {
    marginTop: 6,
    marginBottom: 0,
  },
});
