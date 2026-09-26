// Stand-in for the Selah lane's hook, so the player bar and listen screen can
// render their Selah controls against the agreed contract. The Selah lane
// replaces this file with the real implementation (fade the narration out, keep
// the background sound playing).

export interface SelahControls {
  /** The narration is paused by Selah while the background sound keeps playing. */
  isSelahActive: boolean;
  /** A background sound other than Off is on and a chapter is loaded. */
  canSelah: boolean;
  toggleSelah: () => void;
}

const INACTIVE: SelahControls = {
  isSelahActive: false,
  canSelah: false,
  toggleSelah: () => {},
};

export function useSelah(): SelahControls {
  return INACTIVE;
}
