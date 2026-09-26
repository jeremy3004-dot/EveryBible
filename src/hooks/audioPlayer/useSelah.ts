import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../../stores/audioStore';
import { canSelah, type SelahAvailabilityInput } from '../../stores/audioSelahModel';

export interface SelahControls {
  /** Selah is on: the narration is held (or fading out to be) while the music plays on. */
  isSelahActive: boolean;
  /** A background sound other than Off is on and a chapter is loaded; the button shows. */
  canSelah: boolean;
  /** Selah on or off; does nothing while `canSelah` is false. */
  toggleSelah: () => void;
}

interface SelahView {
  isSelahActive: boolean;
  canSelah: boolean;
}

/** What a Selah button shows. On, it stays available so it can be turned off again. */
export const selectSelahView = (
  state: SelahAvailabilityInput & { selahActive: boolean }
): SelahView => ({
  isSelahActive: state.selahActive,
  canSelah: state.selahActive || canSelah(state),
});

// The engine is required on the first tap, not imported: the tab bar's player row uses this
// hook at boot, and ./selah reaches the native audio stack, which startup must not load.
const toggleSelahFromUi = (): void => {
  const { toggleSelah } = require('./selah') as typeof import('./selah');
  toggleSelah().catch((error: unknown) => console.warn('[Audio] Selah failed:', error));
};

/**
 * Selah for a button, chip or screen. Only reads the store (re-rendering when either
 * value changes) and hands out a stable toggle, so any number of components may use it
 * at once; the engine (./selah) runs once, driven by the mounted audio player.
 */
export function useSelah(): SelahControls {
  const view = useAudioStore(useShallow(selectSelahView));
  return { ...view, toggleSelah: toggleSelahFromUi };
}
