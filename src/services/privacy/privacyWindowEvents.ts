import { AppState } from 'react-native';
import { onPrivacyAppIconChanged } from './appIcon';

/**
 * Tells the screen capture protection when the app may be drawing into a new window:
 * whenever it becomes active (a new activity after the launcher alias switch comes up
 * active), and right after an icon change completes. Each is one call per event.
 */
export function subscribeToAppWindowChanges(listener: () => void): () => void {
  const appState = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      listener();
    }
  });
  const unsubscribeFromIcon = onPrivacyAppIconChanged(listener);
  return () => {
    appState.remove();
    unsubscribeFromIcon();
  };
}
