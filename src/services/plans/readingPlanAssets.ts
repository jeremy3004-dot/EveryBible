import type { ImageSourcePropType } from 'react-native';
import type { ReadingPlan, ReadingPlanCoverKey } from './types';

const COVER_ASSETS: Record<string, ImageSourcePropType> = {
  canyon: require('../../../assets/plans/covers/canyon.webp'),
  desert: require('../../../assets/plans/covers/desert.webp'),
  dunes: require('../../../assets/plans/covers/dunes.webp'),
  faithObedience: require('../../../assets/plans/covers/faithObedience.webp'),
  field: require('../../../assets/plans/covers/field.webp'),
  forest: require('../../../assets/plans/covers/forest.webp'),
  gospelFoundations: require('../../../assets/plans/covers/gospelFoundations.webp'),
  greatCommission: require('../../../assets/plans/covers/greatCommission.webp'),
  hearingGodVoice: require('../../../assets/plans/covers/hearingGodVoice.webp'),
  holinessSanctification: require('../../../assets/plans/covers/holinessSanctification.webp'),
  identityInChrist: require('../../../assets/plans/covers/identityInChrist.webp'),
  kathisma: require('../../../assets/plans/covers/kathisma.png'),
  kingdomOfGod: require('../../../assets/plans/covers/kingdomOfGod.webp'),
  prayerIntimacy: require('../../../assets/plans/covers/prayerIntimacy.webp'),
  mountains: require('../../../assets/plans/covers/mountains.webp'),
  pineSky: require('../../../assets/plans/covers/pineSky.webp'),
  riverForest: require('../../../assets/plans/covers/riverForest.webp'),
  river: require('../../../assets/plans/covers/shore.webp'),
  sandDune: require('../../../assets/plans/covers/sandDune.webp'),
  spiritualWarfare: require('../../../assets/plans/covers/spiritualWarfare.webp'),
  shore: require('../../../assets/plans/covers/shore.webp'),
  seashore: require('../../../assets/plans/covers/seashore.webp'),
  lakeLandscape: require('../../../assets/plans/covers/lakeLandscape.webp'),
  stars: require('../../../assets/plans/covers/stars.webp'),
  sunrise: require('../../../assets/plans/covers/sunrise.webp'),
  valley: require('../../../assets/plans/covers/valley.webp'),
} as const;

export const READING_PLAN_COVER_SOURCES: ReadonlyArray<ImageSourcePropType> = Array.from(
  new Set(Object.values(COVER_ASSETS))
);

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
  return key ? COVER_ASSETS[key] ?? null : null;
}
