import type { AVPlaybackStatus } from 'expo-av';

export interface LessonPlaybackUpdate {
  positionMillis: number;
  /** Null until the stream reports a length. */
  durationMillis: number | null;
  isPlaying: boolean;
  /**
   * The story just ended: seek the sound back to 0. expo-av leaves a finished
   * sound parked at its end on iOS and Android, where playAsync() does nothing,
   * so without the rewind Play and "Listen to the story again" go dead.
   */
  rewind: boolean;
}

/** Maps an expo-av status update onto the lesson listen capsule's state. */
export function readLessonPlaybackStatus(status: AVPlaybackStatus): LessonPlaybackUpdate | null {
  if (!status.isLoaded) {
    return null;
  }

  const durationMillis = status.durationMillis ? status.durationMillis : null;
  if (status.didJustFinish) {
    return { positionMillis: 0, durationMillis, isPlaying: false, rewind: true };
  }
  return {
    positionMillis: status.positionMillis,
    durationMillis,
    isPlaying: status.isPlaying,
    rewind: false,
  };
}
