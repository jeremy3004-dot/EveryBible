import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';
import { claimNarration, type NarrationClaim } from '../../../services/audio/narrationOwnership';
import { createLessonSoundOwner } from '../../learn/lessonSoundOwner';
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
  const [soundOwner] = useState(() => createLessonSoundOwner<Audio.Sound>());
  const soundId = useRef<string | null>(null);
  // Bumped whenever the loaded voice note is replaced or stopped, so a load that
  // settles afterwards knows it is stale and must not start playing.
  const soundRequestId = useRef(0);
  const transportIntent = useRef(0);
  const narration = useRef<NarrationClaim | null>(null);
  const pendingPlayback = useRef<Promise<boolean> | null>(null);
  const pendingRelease = useRef<Promise<void> | null>(null);

  const releaseSound = useCallback((): Promise<void> => {
    if (pendingRelease.current) return pendingRelease.current;
    const pending = pendingPlayback.current;
    const release = soundOwner.release();
    void release.catch(() => undefined);
    const draining = (async () => {
      // Creation and Play can still own native audio after JS invalidation. Wait
      // for them, then release any sound materialized by the obsolete operation.
      await pending?.catch(() => undefined);
      await release;
      await soundOwner.release();
    })();
    pendingRelease.current = draining;
    void draining
      .finally(() => {
        if (pendingRelease.current === draining) pendingRelease.current = null;
      })
      .catch(() => undefined);
    return draining;
  }, [soundOwner]);

  const suspend = useCallback(() => {
    ++soundRequestId.current;
    ++transportIntent.current;
    soundId.current = null;
    setPlaying(null);
    return releaseSound();
  }, [releaseSound]);

  const stop = useCallback(() => {
    narration.current?.cancel();
    void suspend().catch(() => undefined);
  }, [suspend]);

  const play = async (item: ChapterFeedbackReviewItem) => {
    let request = soundRequestId.current;
    const intent = ++transportIntent.current;
    let claim = narration.current;
    const isStale = () => request !== soundRequestId.current || !claim?.isCurrent();
    const isCurrentIntent = () => !isStale() && intent === transportIntent.current;
    try {
      const currentSound = soundOwner.getSound();
      if (soundId.current === item.id && currentSound) {
        if (playing === item.id) {
          await currentSound.pauseAsync();
          if (isCurrentIntent()) setPlaying(null);
        } else {
          if (!claim?.isCurrent()) {
            claim = claimNarration('feedback', soundOwner, suspend);
            narration.current = claim;
          }
          await claim.ready;
          if (!isCurrentIntent()) return;
          const operation = soundOwner.play(async () => currentSound);
          pendingPlayback.current = operation;
          try {
            if (await operation) {
              if (isCurrentIntent()) setPlaying(item.id);
            }
          } finally {
            if (pendingPlayback.current === operation) pendingPlayback.current = null;
          }
        }
        return;
      }
      request = ++soundRequestId.current;
      soundId.current = item.id;
      setPlaying(null);
      claim = claimNarration('feedback', soundOwner, suspend);
      narration.current = claim;
      await claim.ready;
      if (isStale()) return;
      await releaseSound();
      if (isStale()) return;
      const audio = await refreshFeedbackAudioUrl({ ...query(), feedbackId: item.id });
      if (isStale()) return;
      if (!audio.success || !audio.playbackUrl) throw new Error('Audio unavailable');
      const uri = audio.playbackUrl;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (isStale()) return;
      const operation = soundOwner.play(async (isOwned) => {
        // The post-load setter starts an unawaited SDK status query; install
        // the callback before loading so a released native player cannot reject it.
        const created = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
          (playback) => {
            if (!isOwned() || isStale() || !playback.isLoaded) return;
            if (hasHeardEnough(playback)) {
              useTranslatorReviewStore.getState().markListened(item.id);
            }
            if (playback.didJustFinish) stop();
          }
        );
        return created.sound;
      });
      pendingPlayback.current = operation;
      try {
        if ((await operation) && isCurrentIntent()) setPlaying(item.id);
      } finally {
        if (pendingPlayback.current === operation) pendingPlayback.current = null;
      }
    } catch {
      if (!isCurrentIntent()) return;
      setPlaying(null);
      Alert.alert(t('common.error'), t('bible.translatorReviewAudioError'));
    }
  };

  return { playing, play, stop };
}
