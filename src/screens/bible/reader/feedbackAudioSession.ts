import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import { CHAPTER_FEEDBACK_AUDIO_APP_ACTIVE_TIMEOUT_MS } from './readerConstants';

export type ChapterFeedbackAudioState = 'idle' | 'recording' | 'preview' | 'uploading' | 'error';

export const waitForFeedbackAudioActiveAppState = async (): Promise<boolean> => {
  if (AppState.currentState === 'active') {
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        settle(true);
      }
    });
    const timeout = setTimeout(() => {
      settle(AppState.currentState === 'active');
    }, CHAPTER_FEEDBACK_AUDIO_APP_ACTIVE_TIMEOUT_MS);
    if (AppState.currentState === 'active') {
      settle(true);
    }

    function settle(isActive: boolean) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      subscription.remove();
      resolve(isActive);
    }
  });
};

export const restoreFeedbackAudioPlaybackMode = async (): Promise<void> => {
  try {
    // iOS can route playback through the earpiece while recording is allowed.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  } catch {
    // Audio cleanup should not hide the recording error or block the feedback flow.
  }
};
