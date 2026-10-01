import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Whether a sheet should build the content of its `Modal`. React Native's Modal draws
 * nothing while hidden, but a sheet that always passes children still runs its whole
 * body on every parent render to build elements nobody sees (the reader re-renders on
 * every chapter change). The content is built while the modal is visible and, on iOS,
 * until the modal reports its fade-out finished (iOS keeps drawing the children until
 * then, so dropping them early would blank the closing frames). Android removes a
 * hidden modal at once and never reports a dismissal.
 *
 * Pass the returned `handleDismiss` as the Modal's `onDismiss`; it forwards to `onDismiss`.
 */
export function useModalContentPresence(
  visible: boolean,
  onDismiss?: () => void,
  platform: string = Platform.OS
) {
  const [presented, setPresented] = useState(visible);
  if (visible && !presented) setPresented(true);
  if (!visible && presented && platform !== 'ios') setPresented(false);

  const handleDismiss = useCallback(() => {
    setPresented(false);
    onDismiss?.();
  }, [onDismiss]);

  return { isContentPresent: visible || (presented && platform === 'ios'), handleDismiss };
}
