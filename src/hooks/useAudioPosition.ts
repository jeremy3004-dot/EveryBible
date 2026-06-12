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
export function useAudioPosition() {
  return useAudioStore(
    useShallow((state) => ({
      currentPosition: state.currentPosition,
      duration: state.duration,
    }))
  );
}
