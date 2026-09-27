import { useEffect, useState } from 'react';
// One weight per face, imported from its own entry so only that file is bundled
// (each package's index pulls in every weight).
import { AlfaSlabOne_400Regular } from '@expo-google-fonts/alfa-slab-one/400Regular';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat/600SemiBold';
import { DancingScript_600SemiBold } from '@expo-google-fonts/dancing-script/600SemiBold';
import { PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display/600SemiBold_Italic';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite/400Regular';

/**
 * The verse picture's extra faces (Lora and Alte Haas Grotesk load at startup).
 * Keyed by the family names verseImageStyle uses. All SIL Open Font License.
 */
export const VERSE_IMAGE_FONT_SOURCES = {
  DancingScript_600SemiBold,
  Caveat_600SemiBold,
  Anton_400Regular,
  AlfaSlabOne_400Regular,
  PlayfairDisplay_600SemiBold_Italic,
  SpecialElite_400Regular,
};

type ExpoFont = typeof import('expo-font');

/**
 * Loads the extra faces the first time the picture editor opens, not at app
 * start: they are only ever used here, and the boot path waits on every font it
 * loads. expo-font is required lazily for the same reason.
 */
export function useVerseImageFonts(active: boolean): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active || loaded) return;
    let cancelled = false;
    const Font = require('expo-font') as ExpoFont;
    // Already-loaded faces resolve at once.
    Font.loadAsync(VERSE_IMAGE_FONT_SOURCES)
      .catch(() => {
        // A face that fails to load falls back to the platform font; the editor stays usable.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, loaded]);

  return loaded;
}
