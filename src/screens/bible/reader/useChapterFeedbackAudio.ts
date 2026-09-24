import { createLessonSoundOwner } from '../../learn/lessonSoundOwner';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import {
  CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS,
  CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
  type ChapterFeedbackAudioDraft,
} from '../../../services/feedback/chapterFeedbackAudio';
import {
  waitForFeedbackAudioActiveAppState,
  restoreFeedbackAudioPlaybackMode,
} from './feedbackAudioSession';
import { CHAPTER_FEEDBACK_AUDIO_TIMER_MS } from './readerConstants';
import type { ChapterFeedbackAudioState } from './feedbackAudioSession';

export interface ChapterFeedbackAudioInput {
  isSubmittingFeedback: boolean;
  setFeedbackSubmitError: (message: string | null) => void;
}

/**
 * The voice note a chapter-feedback contributor can attach: recording it (with the
 * microphone prompt, a max-duration timer and native teardown), previewing it, and
 * throwing it away. Owns every recorder and sound it creates, including ones that
 * finish loading after the reader closed.
 */
export function useChapterFeedbackAudio({
  isSubmittingFeedback,
  setFeedbackSubmitError,
}: ChapterFeedbackAudioInput) {
  const { t } = useTranslation();
  const [feedbackAudioState, setFeedbackAudioState] = useState<ChapterFeedbackAudioState>('idle');
  const [feedbackAudioDraft, setFeedbackAudioDraft] = useState<ChapterFeedbackAudioDraft | null>(
    null
  );
  const [feedbackAudioElapsedMs, setFeedbackAudioElapsedMs] = useState(0);
  const [feedbackAudioPermissionDenied, setFeedbackAudioPermissionDenied] = useState(false);
  const feedbackAudioRecordingRef = useRef<Audio.Recording | null>(null);
  const feedbackAudioStartedAtRef = useRef<number | null>(null);
  const feedbackAudioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The preview sound has one owner, as the lesson audio does: each tap releases the
  // previous preview, and a preview that finishes loading after it was released or the
  // reader closed is unloaded instead of playing on untracked.
  const [feedbackAudioPreview] = useState(() => createLessonSoundOwner<Audio.Sound>());
  // Starting a recording awaits the permission prompt, the app becoming active and the
  // recorder itself. The in-flight flag turns a double tap into one start; the request
  // counter, bumped on unmount, tells a start that resumes afterwards to back out.
  const feedbackAudioStartInFlightRef = useRef(false);
  const feedbackAudioRecordingRequestRef = useRef(0);
  useEffect(() => {
    return () => {
      if (feedbackAudioTimerRef.current) {
        clearInterval(feedbackAudioTimerRef.current);
      }
      feedbackAudioRecordingRequestRef.current += 1;
      feedbackAudioPreview.release();
      const recording = feedbackAudioRecordingRef.current;
      void (async () => {
        try {
          await recording?.stopAndUnloadAsync();
        } catch {
          // Recording teardown can race with native screen cleanup.
        } finally {
          await restoreFeedbackAudioPlaybackMode();
        }
      })();
    };
  }, [feedbackAudioPreview]);

  const clearFeedbackAudioTimer = () => {
    if (feedbackAudioTimerRef.current) {
      clearInterval(feedbackAudioTimerRef.current);
      feedbackAudioTimerRef.current = null;
    }
  };

  const stopFeedbackAudioPreview = async () => {
    feedbackAudioPreview.release();
  };

  const stopFeedbackAudioRecording = async () => {
    const recording = feedbackAudioRecordingRef.current;
    if (!recording) {
      await restoreFeedbackAudioPlaybackMode();
      return;
    }

    clearFeedbackAudioTimer();
    feedbackAudioRecordingRef.current = null;
    setFeedbackAudioState('preview');

    try {
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        setFeedbackAudioState('error');
        setFeedbackSubmitError(t('bible.chapterFeedbackAudioRecordingMissing'));
        return;
      }

      const durationMs =
        typeof status.durationMillis === 'number' ? status.durationMillis : feedbackAudioElapsedMs;
      setFeedbackAudioDraft({
        uri,
        durationMs: Math.max(durationMs, feedbackAudioElapsedMs),
        mimeType: CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
      });
      setFeedbackAudioElapsedMs(Math.max(durationMs, feedbackAudioElapsedMs));
    } catch {
      // The recorder's own error message is an English diagnostic, not reader copy.
      setFeedbackAudioState('error');
      setFeedbackSubmitError(t('bible.chapterFeedbackAudioStopError'));
    } finally {
      await restoreFeedbackAudioPlaybackMode();
    }
  };

  const startFeedbackAudioRecording = async () => {
    if (
      isSubmittingFeedback ||
      feedbackAudioState === 'recording' ||
      feedbackAudioStartInFlightRef.current
    ) {
      return;
    }

    feedbackAudioStartInFlightRef.current = true;
    const request = feedbackAudioRecordingRequestRef.current;
    const isAbandoned = () => request !== feedbackAudioRecordingRequestRef.current;
    try {
      await stopFeedbackAudioPreview();
      setFeedbackSubmitError(null);
      setFeedbackAudioPermissionDenied(false);

      try {
        const permission = await Audio.requestPermissionsAsync();
        if (isAbandoned()) {
          return;
        }
        if (!permission.granted) {
          setFeedbackAudioPermissionDenied(true);
          setFeedbackAudioState('error');
          setFeedbackSubmitError(t('bible.chapterFeedbackAudioPermissionDenied'));
          return;
        }

        setFeedbackAudioDraft(null);
        setFeedbackAudioElapsedMs(0);
        const isAppActive = await waitForFeedbackAudioActiveAppState();
        if (isAbandoned()) {
          return;
        }
        if (!isAppActive) {
          setFeedbackAudioState('error');
          setFeedbackSubmitError(t('bible.chapterFeedbackAudioStartError'));
          return;
        }
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
        if (isAbandoned()) {
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        if (isAbandoned()) {
          await restoreFeedbackAudioPlaybackMode();
          return;
        }

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        if (isAbandoned()) {
          // The reader closed while the recorder started: release the microphone.
          await recording.stopAndUnloadAsync().catch(() => undefined);
          await restoreFeedbackAudioPlaybackMode();
          return;
        }

        feedbackAudioRecordingRef.current = recording;
        feedbackAudioStartedAtRef.current = Date.now();
        setFeedbackAudioState('recording');
        feedbackAudioTimerRef.current = setInterval(() => {
          const elapsedMs = feedbackAudioStartedAtRef.current
            ? Date.now() - feedbackAudioStartedAtRef.current
            : 0;
          setFeedbackAudioElapsedMs(Math.min(elapsedMs, CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS));

          if (elapsedMs >= CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS) {
            void stopFeedbackAudioRecording();
          }
        }, CHAPTER_FEEDBACK_AUDIO_TIMER_MS);
      } catch {
        clearFeedbackAudioTimer();
        await restoreFeedbackAudioPlaybackMode();
        if (isAbandoned()) {
          return;
        }
        setFeedbackAudioState('error');
        setFeedbackSubmitError(t('bible.chapterFeedbackAudioStartError'));
      }
    } finally {
      feedbackAudioStartInFlightRef.current = false;
    }
  };

  const playFeedbackAudioPreview = async () => {
    if (!feedbackAudioDraft) {
      return;
    }

    // Every tap replays from the start: release the previous preview, then load anew.
    feedbackAudioPreview.release();
    const { uri } = feedbackAudioDraft;
    const played = await feedbackAudioPreview.play(async () => {
      await restoreFeedbackAudioPlaybackMode();
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
      return sound;
    });
    const sound = feedbackAudioPreview.getSound();
    if (!played || !sound) {
      return;
    }
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) {
        return;
      }
      // Only the current preview is released here; an older one was released when a
      // newer tap replaced it, and must not take the playing one down with it.
      if (feedbackAudioPreview.getSound() === sound) {
        feedbackAudioPreview.release();
      }
    });
  };

  const discardFeedbackAudioDraft = () => {
    void stopFeedbackAudioPreview();
    setFeedbackAudioDraft(null);
    setFeedbackAudioElapsedMs(0);
    setFeedbackAudioState('idle');
    setFeedbackAudioPermissionDenied(false);
    setFeedbackSubmitError(null);
  };

  /** The voice-note half of clearing the composer after a submit. */
  const resetFeedbackAudio = () => {
    if (feedbackAudioState === 'recording') {
      void stopFeedbackAudioRecording();
    }
    void stopFeedbackAudioPreview();
    setFeedbackAudioDraft(null);
    setFeedbackAudioElapsedMs(0);
    setFeedbackAudioState('idle');
    setFeedbackAudioPermissionDenied(false);
  };

  return {
    feedbackAudioState,
    setFeedbackAudioState,
    feedbackAudioDraft,
    feedbackAudioElapsedMs,
    feedbackAudioPermissionDenied,
    startFeedbackAudioRecording,
    stopFeedbackAudioRecording,
    playFeedbackAudioPreview,
    discardFeedbackAudioDraft,
    resetFeedbackAudio,
  };
}

export type ChapterFeedbackAudio = ReturnType<typeof useChapterFeedbackAudio>;
