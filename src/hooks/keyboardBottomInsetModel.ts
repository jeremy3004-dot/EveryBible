// Pure keyboard-overlap math, kept free of react-native imports so it can be
// unit tested under `node --test` without a native runtime.

export interface KeyboardBottomInsetInput {
  platform: string;
  /** `endCoordinates.height` — the reported keyboard height. */
  keyboardHeight: number;
  /** `endCoordinates.screenY` — the top edge of the keyboard, in window coordinates. */
  keyboardTopY: number;
  /** Measured bottom edge of the surface in window coordinates, or null when unmeasurable. */
  surfaceBottomY: number | null;
  safeAreaBottomInset: number;
}

/**
 * How much bottom room the surface has to add to keep its last row reachable.
 *
 * iOS reports a keyboard frame measured against the whole window, so the fixed
 * bottom inset the layout already reserves has to come back off it.
 *
 * Android gets the overlap from the surface itself. Neither screen-math
 * shortcut is sound there: `Dimensions.get('window')` does not shrink on IME
 * show, and `edgeToEdgeEnabled` clears `decorFitsSystemWindows`, so
 * `adjustResize` may never move the surface at all — while `endCoordinates
 * .height` already has the nav-bar inset subtracted out of it. Measuring the
 * surface's own bottom against the keyboard top self-corrects either way: if
 * the window did resize, the measured bottom already sits above the keyboard
 * and the overlap is 0.
 */
export function resolveKeyboardBottomInset({
  platform,
  keyboardHeight,
  keyboardTopY,
  surfaceBottomY,
  safeAreaBottomInset,
}: KeyboardBottomInsetInput): number {
  if (platform === 'ios') {
    if (!Number.isFinite(keyboardHeight)) {
      return 0;
    }

    return Math.max(0, keyboardHeight - Math.max(0, safeAreaBottomInset));
  }

  if (
    surfaceBottomY === null ||
    !Number.isFinite(surfaceBottomY) ||
    !Number.isFinite(keyboardTopY)
  ) {
    return 0;
  }

  return Math.max(0, surfaceBottomY - keyboardTopY);
}
