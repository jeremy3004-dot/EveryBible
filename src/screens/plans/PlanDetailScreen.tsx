import React from 'react';
import type { PlanDetailScreenProps } from '../../navigation/types';
// Re-use the existing detail screen content from the learn stack.
import { ReadingPlanDetailScreen } from '../learn/ReadingPlanDetailScreen';

export function PlanDetailScreen({ route, navigation }: PlanDetailScreenProps) {
  return <ReadingPlanDetailScreen planId={route.params.planId} navigation={navigation} />;
}
