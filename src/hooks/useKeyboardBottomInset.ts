import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Reports how much of the current window the on-screen keyboard covers, so
// scrollable content can grow its bottom padding and keep every row reachable.
//
// iOS only. Android returns 0 to hold existing behavior rather than guess:
// neither screen-math shortcut is sound there. Dimensions.get('window') does
// not shrink on IME show (DeviceInfoModule dedupes, and the metrics it reads
// only refresh on rotation), and endCoordinates.height already has the nav-bar
// inset subtracted. If Android turns out to need this too, measure the scroll
// surface's own bottom against the keyboard top — that self-corrects whether or
// not the window resized, which matters because edge-to-edge clears
// decorFitsSystemWindows and adjustResize may therefore do nothing.
export function useKeyboardBottomInset(): number {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const showSubscription = Keyboard.addListener('keyboardWillShow', (event) => {
      setBottomInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      setBottomInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return bottomInset;
}
