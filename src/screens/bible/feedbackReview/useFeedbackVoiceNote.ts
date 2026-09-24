import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';
import {
  refreshFeedbackAudioUrl,
  type ChapterFeedbackReviewItem,
} from '../../../services/feedback';
import { hasHeardEnough, type FeedbackReviewQuery } from './feedbackReviewScreenModel';

/**
 * Plays one reviewer voice note at a time. Listen on the loaded note toggles
 * pause/resume; Listen on another note replaces it. Every load checks it is still
 * the newest request after each await, so a slow load superseded by another
 * Listen, or by `stop` when the screen loses focus, is unloaded instead of played.
 */
export function useFeedbackVoiceNote(query: () => FeedbackReviewQuery) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState<string | null>(null);
  const sound = useRef<Audio.Sound | null>(null);
  const soundId = useRef<string | null>(null);
  // Bumped whenever the loaded voice note is replaced or stopped, so a load that
  // settles afterwards knows it is stale and must not start playing.
  const soundRequestId = useRef(0);

  const stop = useCallback(() => {
    ++soundRequestId.current;
    void sound.current?.unloadAsync().catch(() => {});
    sound.current = null;
    soundId.current = null;
    setPlaying(null);
  }, []);

  const play = async (item: ChapterFeedbackReviewItem) => {
    let request = soundRequestId.current;
    const isStale = () => request !== soundRequestId.current;
    try {
      if (soundId.current === item.id && sound.current) {
        if (playing === item.id) {
          await sound.current.pauseAsync();
          setPlaying(null);
        } else {
          await sound.current.playAsync();
          setPlaying(item.id);
        }
        return;
      }
      request = ++soundRequestId.current;
      const previous = sound.current;
      sound.current = null;
      soundId.current = item.id;
      setPlaying(null);
      await previous?.unloadAsync();
      const audio = await refreshFeedbackAudioUrl({ ...query(), feedbackId: item.id });
      if (isStale()) return;
      if (!audio.success || !audio.playbackUrl) throw new Error('Audio unavailable');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (isStale()) return;
      const created = await Audio.Sound.createAsync(
        { uri: audio.playbackUrl },
        { shouldPlay: true }
      );
      if (isStale()) {
        // A newer Listen or leaving the screen superseded this load; nothing can stop it later.
        void created.sound.unloadAsync().catch(() => {});
        return;
      }
      sound.current = created.sound;
      setPlaying(item.id);
      created.sound.setOnPlaybackStatusUpdate((playback) => {
        if (!playback.isLoaded) return;
        if (hasHeardEnough(playback)) {
          useTranslatorReviewStore.getState().markListened(item.id);
        }
        if (playback.didJustFinish) {
          void created.sound.unloadAsync();
          // An older clip finishing must not clear the state of the one playing now.
          if (sound.current !== created.sound) return;
          setPlaying(null);
          sound.current = null;
        }
      });
    } catch {
      if (isStale()) return;
      setPlaying(null);
      Alert.alert(t('common.error'), t('bible.translatorReviewAudioError'));
    }
  };

  return { playing, play, stop };
}
