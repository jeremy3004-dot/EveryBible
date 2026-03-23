import { ImageSourcePropType } from 'react-native';

/**
 * Static icon registry for Gather tab custom PNG icons.
 *
 * React Native requires static require() calls — dynamic string interpolation
 * won't work. Each key matches the `iconImage` value stored on the
 * GatherFoundation / GatherTopic / GatherTopicCategory data objects.
 *
 * Asset location: assets/icons/gather/*.png (200x200 circular PNGs)
 */
export const gatherIconImages: Record<string, ImageSourcePropType> = {
  // ── Foundations (7) ───────────────────────────────────────────────
  'foundation-1': require('../../assets/icons/gather/foundation-1-story-of-god.png'),
  'foundation-2': require('../../assets/icons/gather/foundation-2-life-of-jesus.png'),
  'foundation-3': require('../../assets/icons/gather/foundation-3-gospel-invitation.png'),
  'foundation-4': require('../../assets/icons/gather/foundation-4-life-as-disciple.png'),
  'foundation-5': require('../../assets/icons/gather/foundation-5-jesus-community.png'),
  'foundation-6': require('../../assets/icons/gather/foundation-6-life-as-leader.png'),
  'foundation-7': require('../../assets/icons/gather/foundation-7-sharing-good-news.png'),

  // ── Topic categories (5) ─────────────────────────────────────────
  'category-inner-life': require('../../assets/icons/gather/category-inner-life.png'),
  'category-challenge': require('../../assets/icons/gather/category-challenge.png'),
  'category-money': require('../../assets/icons/gather/category-money.png'),
  'category-people': require('../../assets/icons/gather/category-people.png'),
  'category-knowing-god': require('../../assets/icons/gather/category-knowing-god.png'),

  // ── Topics: The Inner Life (6) ───────────────────────────────────
  'topic-courage': require('../../assets/icons/gather/topic-courage.png'),
  'topic-faith': require('../../assets/icons/gather/topic-faith.png'),
  'topic-hope': require('../../assets/icons/gather/topic-hope.png'),
  'topic-justice': require('../../assets/icons/gather/topic-justice.png'),
  'topic-love': require('../../assets/icons/gather/topic-love.png'),
  'topic-obedience': require('../../assets/icons/gather/topic-obedience.png'),

  // ── Topics: Challenge (6, minus reconciliation which uses Ionicon fallback) ──
  'topic-anger': require('../../assets/icons/gather/topic-anger.png'),
  'topic-crisis': require('../../assets/icons/gather/topic-crisis.png'),
  'topic-grief': require('../../assets/icons/gather/topic-grief.png'),
  'topic-hurt': require('../../assets/icons/gather/topic-hurt.png'),
  'topic-known-and-loved': require('../../assets/icons/gather/topic-known-and-loved.png'),
  'topic-stress': require('../../assets/icons/gather/topic-stress.png'),
  // NOTE: topic-reconciliation intentionally omitted — uses Ionicon fallback

  // ── Topics: Money (4) ────────────────────────────────────────────
  'topic-money-and-god': require('../../assets/icons/gather/topic-money-and-god.png'),
  'topic-money-advice': require('../../assets/icons/gather/topic-money-advice.png'),
  'topic-giving': require('../../assets/icons/gather/topic-giving.png'),
  'topic-marketplace': require('../../assets/icons/gather/topic-marketplace.png'),

  // ── Topics: People (6) ───────────────────────────────────────────
  'topic-marriage': require('../../assets/icons/gather/topic-marriage.png'),
  'topic-men': require('../../assets/icons/gather/topic-men.png'),
  'topic-parenting': require('../../assets/icons/gather/topic-parenting.png'),
  'topic-singles': require('../../assets/icons/gather/topic-singles.png'),
  'topic-women': require('../../assets/icons/gather/topic-women.png'),
  'topic-youth': require('../../assets/icons/gather/topic-youth.png'),

  // ── Topics: Knowing God (3) ──────────────────────────────────────
  'topic-character-of-god': require('../../assets/icons/gather/topic-character-of-god.png'),
  'topic-promises-of-god': require('../../assets/icons/gather/topic-promises-of-god.png'),
  'topic-names-of-god': require('../../assets/icons/gather/topic-names-of-god.png'),
};
