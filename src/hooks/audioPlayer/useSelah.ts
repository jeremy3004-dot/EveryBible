/**
 * Stand-in for the Selah lane's hook, so the Read Along view can place its Selah
 * button against the shared contract. The Selah lane replaces this file; until then
 * Selah is never available and the button draws nothing.
 */
export function useSelah(): { isSelahActive: boolean; canSelah: boolean; toggleSelah: () => void } {
  return { isSelahActive: false, canSelah: false, toggleSelah: () => {} };
}
