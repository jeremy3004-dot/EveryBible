import type { ImageSourcePropType } from 'react-native';
import { HOME_VERSE_BACKGROUND_SOURCES } from './homeVerseBackgrounds';
import { READING_PLAN_COVER_SOURCES } from '../services/plans/readingPlanAssets';

/**
 * Backgrounds available in scripture image-share pickers.
 *
 * Keep the existing home verse backgrounds first so the default daily selection
 * remains stable, then append the bundled reading-plan cover art so the same
 * on-device photography can be reused for scripture sharing.
 */
export const SHARE_VERSE_BACKGROUND_SOURCES: ReadonlyArray<ImageSourcePropType> = [
  ...HOME_VERSE_BACKGROUND_SOURCES,
  ...READING_PLAN_COVER_SOURCES,
];
