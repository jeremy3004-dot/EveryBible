import type { ImageSourcePropType } from 'react-native';
import type { ReadingPlan, ReadingPlanCoverKey } from './types';

const COVER_ASSETS: Record<string, ImageSourcePropType> = {
  advent: require('../../../assets/plans/covers/advent.png'),
  canyon: require('../../../assets/plans/covers/canyon.png'),
  christmas: require('../../../assets/plans/covers/christmas.png'),
  commonPrayerPsalter: require('../../../assets/plans/covers/commonPrayerPsalter.png'),
  desert: require('../../../assets/plans/covers/desert.png'),
  dunes: require('../../../assets/plans/covers/dunes.png'),
  faithObedience: require('../../../assets/plans/covers/faithObedience.png'),
  field: require('../../../assets/plans/covers/field.png'),
  forest: require('../../../assets/plans/covers/forest.png'),
  gospelsMonthly: require('../../../assets/plans/covers/gospelsMonthly.png'),
  gospelFoundations: require('../../../assets/plans/covers/gospelFoundations.png'),
  greatCommission: require('../../../assets/plans/covers/greatCommission.png'),
  hearingGodVoice: require('../../../assets/plans/covers/hearingGodVoice.png'),
  holinessSanctification: require('../../../assets/plans/covers/holinessSanctification.png'),
  identityInChrist: require('../../../assets/plans/covers/identityInChrist.png'),
  kathisma: require('../../../assets/plans/covers/kathisma.png'),
  kingdomOfGod: require('../../../assets/plans/covers/kingdomOfGod.png'),
  lifeLoss: require('../../../assets/plans/covers/lifeLoss.png'),
  lifeStress: require('../../../assets/plans/covers/lifeStress.png'),
  lifeFear: require('../../../assets/plans/covers/lifeFear.png'),
  lifePeace: require('../../../assets/plans/covers/lifePeace.png'),
  lifeDepression: require('../../../assets/plans/covers/lifeDepression.png'),
  lifeHope: require('../../../assets/plans/covers/lifeHope.png'),
  lifeHealing: require('../../../assets/plans/covers/lifeHealing.png'),
  lifeAnger: require('../../../assets/plans/covers/lifeAnger.png'),
  lifeAnxiety: require('../../../assets/plans/covers/lifeAnxiety.png'),
  lifeLove: require('../../../assets/plans/covers/lifeLove.png'),
  lifePatience: require('../../../assets/plans/covers/lifePatience.png'),
  lifeDoubt: require('../../../assets/plans/covers/lifeDoubt.png'),
  lifePride: require('../../../assets/plans/covers/lifePride.png'),
  lifeTemptation: require('../../../assets/plans/covers/lifeTemptation.png'),
  lifeFamily: require('../../../assets/plans/covers/lifeFamily.png'),
  lordsPrayer: require('../../../assets/plans/covers/lordsPrayer.png'),
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
  weekOfChrist: require('../../../assets/plans/covers/weekOfChrist.png'),
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
  const key = (plan.cover_image_key ?? plan.cover_key ?? plan.coverKey) as
    | ReadingPlanCoverKey
    | null
    | undefined;
  return key ? (COVER_ASSETS[key] ?? null) : null;
}
