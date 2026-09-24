import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppCard, EmptyState, SectionHeader } from '../../../components/ui';
import { layout, spacing } from '../../../design/system';
import { CompletedPlanRow } from './CompletedPlanRow';
import type { CompletedPlanItem } from './plansHomeModel';

interface CompletedPlansSectionProps {
  completedPlans: CompletedPlanItem[];
  onPlanPress: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
}

/** The reader's finished plans, in one card. */
export function CompletedPlansSection({
  completedPlans,
  onPlanPress,
  onDeletePlan,
}: CompletedPlansSectionProps) {
  const { t } = useTranslation();

  if (completedPlans.length === 0) {
    return (
      <EmptyState icon="checkmark-circle-outline" title={t('readingPlans.noCompletedPlans')} />
    );
  }

  return (
    <View style={styles.content}>
      <SectionHeader
        title={t('readingPlans.completed')}
        eyebrow={t('readingPlans.plansCount', { count: completedPlans.length })}
        style={styles.sectionHeader}
      />
      <AppCard padding={0}>
        {completedPlans.map((item, index) => (
          <CompletedPlanRow
            key={item.id}
            item={item}
            isFirst={index === 0}
            onPlanPress={onPlanPress}
            onDeletePlan={onDeletePlan}
          />
        ))}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  sectionHeader: {
    marginTop: 6,
    marginBottom: 0,
  },
});
