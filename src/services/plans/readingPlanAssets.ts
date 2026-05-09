import type { ImageSourcePropType } from 'react-native';
import type { ReadingPlan, ReadingPlanCoverKey } from './types';

const COVER_ASSETS: Record<string, ImageSourcePropType> = {
  canyon: require('../../../assets/plans/covers/canyon.png'),
  desert: require('../../../assets/plans/covers/desert.png'),
  dunes: require('../../../assets/plans/covers/dunes.png'),
  faithObedience: require('../../../assets/plans/covers/faithObedience.png'),
  field: require('../../../assets/plans/covers/field.png'),
  forest: require('../../../assets/plans/covers/forest.png'),
  gospelFoundations: require('../../../assets/plans/covers/gospelFoundations.png'),
  greatCommission: require('../../../assets/plans/covers/greatCommission.png'),
  hearingGodVoice: require('../../../assets/plans/covers/hearingGodVoice.png'),
  holinessSanctification: require('../../../assets/plans/covers/holinessSanctification.png'),
  identityInChrist: require('../../../assets/plans/covers/identityInChrist.png'),
  kathisma: require('../../../assets/plans/covers/kathisma.png'),
  kingdomOfGod: require('../../../assets/plans/covers/kingdomOfGod.png'),
  prayerIntimacy: require('../../../assets/plans/covers/prayerIntimacy.png'),
  mountains: require('../../../assets/plans/covers/mountains.png'),
  pineSky: require('../../../assets/plans/covers/pineSky.png'),
  riverForest: require('../../../assets/plans/covers/riverForest.png'),
  river: require('../../../assets/plans/covers/shore.png'),
  sandDune: require('../../../assets/plans/covers/sandDune.png'),
  spiritualWarfare: require('../../../assets/plans/covers/spiritualWarfare.png'),
  shore: require('../../../assets/plans/covers/shore.png'),
  seashore: require('../../../assets/plans/covers/seashore.png'),
  lakeLandscape: require('../../../assets/plans/covers/lakeLandscape.png'),
  stars: require('../../../assets/plans/covers/stars.png'),
  sunrise: require('../../../assets/plans/covers/sunrise.png'),
  valley: require('../../../assets/plans/covers/valley.png'),
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
