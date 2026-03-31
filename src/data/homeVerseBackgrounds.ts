import type { ImageSourcePropType } from 'react-native';
import { getHomeVerseBackgroundIndex } from './homeVerseBackgroundSelection';

/**
 * Compressed landscape photos for the Verse of the Day card.
 *
 * The sources are stored locally so the home screen can rotate through them
 * without network access or runtime downloads.
 */
export const HOME_VERSE_BACKGROUND_SOURCES = [
  require('../../assets/home/verse-backgrounds/daniel-leone-g30P1zcOzXo-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/daniel-leone-v7daTKlZzaw-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/jay-castor-7AcMUSYRZpU-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/jeremy-bishop-dvACrXUExLs-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/marita-kavelashvili-ugnrXk1129g-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/sorasak-8ZAxI5FwjFo-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/willian-justen-de-vasconcellos-T_Qe4QlMIvQ-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/casey-horner-O0R5XZfKUGQ-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/masaaki-komori-6EfKUoRTe8I-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/mohammad-alizade-4wzRuAb-KWs-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/v2osk-1Z2niiBPg5A-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/marco-xu-i5Epy0nkAEs-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/sebastian-boring-8zD7rs8UpxU-unsplash.jpg'),
  require('../../assets/home/verse-backgrounds/bruce-timana-hWOwYb4Lz3U-unsplash.jpg'),
] as const satisfies ReadonlyArray<ImageSourcePropType>;

export function getHomeVerseBackground(date = new Date()): ImageSourcePropType {
  return HOME_VERSE_BACKGROUND_SOURCES[
    getHomeVerseBackgroundIndex(date, HOME_VERSE_BACKGROUND_SOURCES.length)
  ];
}
