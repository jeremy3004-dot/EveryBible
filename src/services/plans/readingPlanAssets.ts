import type { ImageSourcePropType } from 'react-native';
import type { ReadingPlan } from './types';

const COVER_ASSETS = {
  canyon: require('../../../assets/plans/covers/canyon.webp'),
  desert: require('../../../assets/plans/covers/desert.webp'),
  dunes: require('../../../assets/plans/covers/dunes.webp'),
  forest: require('../../../assets/plans/covers/forest.webp'),
  mountains: require('../../../assets/plans/covers/mountains.webp'),
  shore: require('../../../assets/plans/covers/shore.webp'),
  stars: require('../../../assets/plans/covers/stars.webp'),
  sunrise: require('../../../assets/plans/covers/sunrise.webp'),
  valley: require('../../../assets/plans/covers/valley.webp'),
} as const;

export type ReadingPlanCoverKey = keyof typeof COVER_ASSETS;

export function getReadingPlanCoverSource(plan: Pick<ReadingPlan, 'cover_image_key'>): ImageSourcePropType | null {
  const key = plan.cover_image_key as ReadingPlanCoverKey | undefined;
  return key ? COVER_ASSETS[key] : null;
}

