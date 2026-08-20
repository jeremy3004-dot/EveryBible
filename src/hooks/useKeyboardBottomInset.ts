import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Reports how much of the current window the on-screen keyboard covers, so
// scrollable content can grow its bottom padding and keep every row reachable.
// Android returns 0: softwareKeyboardLayoutMode defaults to resize, so the
// window itself shrinks and extra padding would double-compensate.
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
