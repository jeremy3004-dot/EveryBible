import type { ImageSourcePropType } from 'react-native';
import { getHomeVerseBackgroundIndex } from './homeVerseBackgroundSelection';

/**
 * Warm film-style landscape pictures for the Verse of the Day card (generated for
 * EveryBible; see assets/home/verse-backgrounds/SOURCES.md).
 *
 * The sources are stored locally so the home screen can rotate through them
 * without network access or runtime downloads.
 */
export const HOME_VERSE_BACKGROUND_SOURCES = [
  require('../../assets/home/verse-backgrounds/olive-grove.jpg'),
  require('../../assets/home/verse-backgrounds/mountain-lake.jpg'),
  require('../../assets/home/verse-backgrounds/forest-path.jpg'),
  require('../../assets/home/verse-backgrounds/desert-dunes.jpg'),
  require('../../assets/home/verse-backgrounds/night-stars.jpg'),
  require('../../assets/home/verse-backgrounds/mountains-dawn.jpg'),
  require('../../assets/home/verse-backgrounds/river-valley.jpg'),
  require('../../assets/home/verse-backgrounds/wheat-field.jpg'),
  require('../../assets/home/verse-backgrounds/night-moon.jpg'),
  require('../../assets/home/verse-backgrounds/forest-light.jpg'),
  require('../../assets/home/verse-backgrounds/stone-path.jpg'),
  require('../../assets/home/verse-backgrounds/still-water.jpg'),
  require('../../assets/home/verse-backgrounds/wilderness-canyon.jpg'),
  require('../../assets/home/verse-backgrounds/rolling-hills.jpg'),
  require('../../assets/home/verse-backgrounds/lamp-window.jpg'),
  require('../../assets/home/verse-backgrounds/desert-road.jpg'),
  require('../../assets/home/verse-backgrounds/waterfall.jpg'),
  require('../../assets/home/verse-backgrounds/snowy-field.jpg'),
  require('../../assets/home/verse-backgrounds/rocky-shore.jpg'),
  require('../../assets/home/verse-backgrounds/cloud-sky.jpg'),
] as const satisfies ReadonlyArray<ImageSourcePropType>;

export function getHomeVerseBackground(date = new Date()): ImageSourcePropType {
  return HOME_VERSE_BACKGROUND_SOURCES[
    getHomeVerseBackgroundIndex(date, HOME_VERSE_BACKGROUND_SOURCES.length)
  ];
}
