import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../stores/audioStore';

/**
 * Leaf hook that subscribes ONLY to the live audio position fields.
 *
 * `audioStore.setPosition` fires every ~250ms while playing (interpolation tick)
 * plus on every real poll, so any component that needs the continuously-updating
 * position/duration (progress rings, scrubbers) should consume this hook in
 * isolation. Keeping it separate from `useAudioPlayer` means the broad set of
 * screens that consume `useAudioPlayer` for transport controls do not re-render
 * on every position tick.
 */
export function useAudioPosition(track?: {
  translationId: string;
  bookId: string;
  chapter: number;
}) {
  return useAudioStore(
    useShallow((state) => {
      // A reader displaying another chapter has no live progress to paint.
      // Preserve the legacy unknown-translation match used by the reader.
      const matchesTrack =
        !track ||
        (state.currentBookId === track.bookId &&
          state.currentChapter === track.chapter &&
          (state.currentTranslationId == null ||
            state.currentTranslationId === track.translationId));
      return {
        currentPosition: matchesTrack ? state.currentPosition : 0,
        duration: matchesTrack ? state.duration : 0,
      };
    })
  );
}
