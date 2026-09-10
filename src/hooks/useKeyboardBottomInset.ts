import { useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { resolveKeyboardBottomInset } from './keyboardBottomInsetModel';

/**
 * Anything that can report its own position in window coordinates — in practice
 * a host `View` ref. Typed structurally so the hook does not force its callers
 * to reach for a concrete component type.
 */
export interface KeyboardMeasurableSurface {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

export interface UseKeyboardBottomInsetOptions {
  /**
   * The scrollable surface the keyboard may cover. Android needs it: the
   * keyboard frame alone cannot say how much of the surface is hidden, so the
   * surface's own bottom edge is measured against the keyboard top instead.
   * Without it the Android branch reports 0, as it always has.
   */
  surfaceRef?: RefObject<KeyboardMeasurableSurface | null>;
  /**
   * Bottom inset the surface's layout already reserves (a SafeAreaView's home
   * indicator gap, say). Only the iOS branch discounts it, because only there
   * is the reported keyboard frame measured against the raw window rather than
   * against the surface.
   */
  safeAreaBottomInset?: number;
}

// Reports how much of the surface the on-screen keyboard covers, so scrollable
// content can grow its bottom padding — and a pinned footer can lift — while
// the keyboard is up.
export function useKeyboardBottomInset(options: UseKeyboardBottomInsetOptions = {}): number {
  const { surfaceRef, safeAreaBottomInset = 0 } = options;
  const [bottomInset, setBottomInset] = useState(0);

  // Read through refs inside the listeners so a changed inset or surface never
  // tears down and re-adds the subscriptions mid-keyboard-animation.
  const safeAreaBottomInsetRef = useRef(safeAreaBottomInset);
  const surfaceRefRef = useRef(surfaceRef);

  useEffect(() => {
    safeAreaBottomInsetRef.current = safeAreaBottomInset;
    surfaceRefRef.current = surfaceRef;
  });

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';

    const handleShow = (event: KeyboardEvent) => {
      if (isIOS) {
        setBottomInset(
          resolveKeyboardBottomInset({
            platform: 'ios',
            keyboardHeight: event.endCoordinates.height,
            keyboardTopY: event.endCoordinates.screenY,
            surfaceBottomY: null,
            safeAreaBottomInset: safeAreaBottomInsetRef.current,
          })
        );
        return;
      }

      const surface = surfaceRefRef.current?.current;
      if (!surface) {
        setBottomInset(0);
        return;
      }

      surface.measureInWindow((_x, y, _width, height) => {
        setBottomInset(
          resolveKeyboardBottomInset({
            platform: Platform.OS,
            keyboardHeight: event.endCoordinates.height,
            keyboardTopY: event.endCoordinates.screenY,
            surfaceBottomY: y + height,
            safeAreaBottomInset: safeAreaBottomInsetRef.current,
          })
        );
      });
    };

    // iOS gets the frame before the animation starts, so the inset lands with
    // it; Android only reports the keyboard once it is up.
    const showSubscription = Keyboard.addListener(
      isIOS ? 'keyboardWillShow' : 'keyboardDidShow',
      handleShow
    );
    const hideSubscription = Keyboard.addListener(
      isIOS ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setBottomInset(0);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return bottomInset;
}
