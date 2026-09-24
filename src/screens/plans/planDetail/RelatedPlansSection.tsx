import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../../design/system';
import { AppCard, SectionHeader } from '../../../components/ui';
import type { ReadingPlan } from '../../../services/plans/types';
import { PlanCoverImage } from './PlanCoverImage';

const RELATED_CARD_WIDTH = 172;

interface RelatedPlanCardProps {
  plan: ReadingPlan;
  onPress: (planId: string) => void;
}

function RelatedPlanCard({ plan, onPress }: RelatedPlanCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const title = t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key });

  return (
    <AppCard
      pressable
      padding={0}
      onPress={() => onPress(plan.id)}
      style={styles.card}
      accessibilityLabel={title}
    >
      <PlanCoverImage plan={plan} width={RELATED_CARD_WIDTH} height={92} borderRadius={0} />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.primaryText }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.duration, { color: colors.secondaryText }]}>
          {t('readingPlans.durationDays', { count: plan.duration_days })}
        </Text>
      </View>
    </AppCard>
  );
}

// Module scope, so the list keeps one separator component type across renders
// instead of remounting every separator whenever the screen re-renders.
function RelatedPlanSeparator() {
  return <View style={styles.separator} />;
}

const keyExtractor = (item: ReadingPlan) => item.id;

interface RelatedPlansSectionProps {
  plans: ReadingPlan[];
  onPlanPress: (planId: string) => void;
}

/** A horizontal row of other plans in the same category, under the ledger. */
export function RelatedPlansSection({ plans, onPlanPress }: RelatedPlansSectionProps) {
  const { t } = useTranslation();
  const renderItem = useCallback(
    ({ item }: { item: ReadingPlan }) => <RelatedPlanCard plan={item} onPress={onPlanPress} />,
    [onPlanPress]
  );

  return (
    <View>
      {plans.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t('readingPlans.relatedPlans')} style={styles.header} />
          <FlatList
            data={plans}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={RelatedPlanSeparator}
            renderItem={renderItem}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    paddingHorizontal: layout.screenPadding,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
  },
  separator: {
    width: spacing.md,
  },
  card: {
    width: RELATED_CARD_WIDTH,
    overflow: 'hidden',
  },
  info: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.captionStrong,
  },
  duration: {
    ...typography.caption,
  },
});
