import { BACKGROUND_MUSIC_CHOICES, type BackgroundMusicChoice } from '../types/audio';

// Stand-in for the audio engine lane's hook (built alongside
// src/services/audio/backgroundSoundCache.ts), which replaces this file when the lanes
// merge. Until then every sound reads as bundled, so the sound library shows no
// download badges.
export type BackgroundSoundAvailability =
  | 'bundled'
  | 'cached'
  | 'remote'
  | 'downloading'
  | 'failed';

const ALL_BUNDLED = Object.fromEntries(
  BACKGROUND_MUSIC_CHOICES.map((choice) => [choice, 'bundled'])
) as Record<BackgroundMusicChoice, BackgroundSoundAvailability>;

/** Whether each background sound plays from the app, the device cache, or still needs downloading. */
export function useBackgroundSoundAvailability(): Record<
  BackgroundMusicChoice,
  BackgroundSoundAvailability
> {
  return ALL_BUNDLED;
}
