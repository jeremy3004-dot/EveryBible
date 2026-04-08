import type { ImageSourcePropType } from 'react-native';
import type { ReadingPlan, ReadingPlanCoverKey } from './types';

const COVER_ASSETS = {
  canyon: require('../../../assets/plans/covers/canyon.webp'),
  desert: require('../../../assets/plans/covers/desert.webp'),
  dunes: require('../../../assets/plans/covers/dunes.webp'),
  forest: require('../../../assets/plans/covers/forest.webp'),
  mountains: require('../../../assets/plans/covers/mountains.webp'),
  river: require('../../../assets/plans/covers/shore.webp'),
  shore: require('../../../assets/plans/covers/shore.webp'),
  stars: require('../../../assets/plans/covers/stars.webp'),
  sunrise: require('../../../assets/plans/covers/sunrise.webp'),
  valley: require('../../../assets/plans/covers/valley.webp'),
} as const;

type ReadingPlanCoverInput = {
  coverKey?: ReadingPlan['coverKey'] | null;
  cover_key?: ReadingPlan['cover_key'] | null;
  cover_image_key?: ReadingPlan['cover_image_key'] | null;
};

export function getReadingPlanCoverSource(plan: ReadingPlanCoverInput): ImageSourcePropType | null {
  const key =
    (plan.cover_image_key ??
      plan.cover_key ??
      plan.coverKey) as ReadingPlanCoverKey | null | undefined;
  return key ? COVER_ASSETS[key] : null;
}
