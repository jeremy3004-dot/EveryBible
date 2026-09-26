import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  BACKGROUND_MUSIC_OPTIONS,
  getBackgroundMusicOption,
} from '../services/audio/backgroundMusicCatalog';
import {
  backgroundSoundCache,
  getSoundAvailability,
  type BackgroundSoundAvailability,
} from '../services/audio/backgroundSoundCache';
import { BACKGROUND_MUSIC_CHOICES, type BackgroundMusicChoice } from '../types/audio';

/**
 * Whether each background sound can play now, for the sound library's download badges.
 * Off and Shuffle always can. A sound id the catalog does not list yet has no file to
 * play, so it reads as failed. Mounting re-reads the disk, so a sound downloaded in an
 * earlier session shows as cached.
 */
export function useBackgroundSoundAvailability(): Record<
  BackgroundMusicChoice,
  BackgroundSoundAvailability
> {
  const snapshot = useSyncExternalStore(
    backgroundSoundCache.subscribe,
    backgroundSoundCache.getSnapshot
  );

  useEffect(() => {
    void backgroundSoundCache.refresh(BACKGROUND_MUSIC_OPTIONS);
  }, []);

  return useMemo(() => {
    const availability = {} as Record<BackgroundMusicChoice, BackgroundSoundAvailability>;
    for (const choice of BACKGROUND_MUSIC_CHOICES) {
      const option = getBackgroundMusicOption(choice);
      availability[choice] =
        choice === 'off' || choice === 'shuffle'
          ? 'bundled'
          : option
            ? getSoundAvailability(option, snapshot)
            : 'failed';
    }
    return availability;
  }, [snapshot]);
}
