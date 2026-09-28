import { createLessonSoundOwner } from '../../learn/lessonSoundOwner';
import { claimNarration, type NarrationClaim } from '../../../services/audio/narrationOwnership';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { InteractionManager } from 'react-native';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { useLatestCallback } from '../../../components/audio/playbackControlsParts/useLatestCallback';
import { withPrivacyLockGrace } from '../../../services/privacy/privacyLockGrace';
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
  contextKey: string;
  isSubmittingFeedback: boolean;
  setFeedbackSubmitError: (message: string | null) => void;
}

/**
 * The voice note a chapter-feedback contributor can attach: recording it (with the
 * microphone prompt, a max-duration timer and native teardown), previewing it, and
 * throwing it away. Owns every recorder and sound it creates, including ones that
 * finish loading after the reader closed. Drafts and native results belong to the
 * supplied chapter/account context; replacing it discards the prior voice note.
 */
export function useChapterFeedbackAudio({
  contextKey,
  isSubmittingFeedback,
  setFeedbackSubmitError,
}: ChapterFeedbackAudioInput) {
  const { t } = useTranslation();
  const feedbackAudioContextRef = useRef(contextKey);
  const feedbackAudioContextGenerationRef = useRef(0);
  const [feedbackAudioState, setFeedbackAudioState] = useState<ChapterFeedbackAudioState>('idle');
  const [feedbackAudioDraft, setFeedbackAudioDraft] = useState<ChapterFeedbackAudioDraft | null>(
    null
  );
  const [feedbackAudioElapsedMs, setFeedbackAudioElapsedMs] = useState(0);
  const feedbackAudioElapsedMsRef = useRef(0);
  const updateFeedbackAudioElapsedMs = (elapsedMs: number) => {
    feedbackAudioElapsedMsRef.current = elapsedMs;
    setFeedbackAudioElapsedMs(elapsedMs);
  };
  const [feedbackAudioPermissionDenied, setFeedbackAudioPermissionDenied] = useState(false);
  const [isFeedbackAudioStarting, setIsFeedbackAudioStarting] = useState(false);
  const feedbackAudioRecordingRef = useRef<Audio.Recording | null>(null);
  const feedbackAudioRecordingContextRef = useRef(0);
  const feedbackAudioRecordingCanDraftRef = useRef(false);
  const feedbackAudioStopInFlightRef = useRef<Promise<void> | null>(null);
  const feedbackAudioNativeStartRef = useRef<Promise<void> | null>(null);
  const feedbackAudioPreviewOperationRef = useRef<Promise<boolean> | null>(null);
  const feedbackAudioSuspendRef = useRef<Promise<void> | null>(null);
  const feedbackAudioClaimRef = useRef<NarrationClaim | null>(null);
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
      feedbackAudioClaimRef.current?.cancel();
      if (!feedbackAudioClaimRef.current) {
        void feedbackAudioPreview.release().catch(() => undefined);
      }
    };
  }, [feedbackAudioPreview]);

  const clearFeedbackAudioTimer = () => {
    if (feedbackAudioTimerRef.current) {
      clearInterval(feedbackAudioTimerRef.current);
      feedbackAudioTimerRef.current = null;
    }
  };

  const stopFeedbackAudioPreview = async () => {
    const pending = feedbackAudioPreviewOperationRef.current;
    const release = feedbackAudioPreview.release();
    void release.catch(() => undefined);
    await pending?.catch(() => undefined);
    await release;
    await feedbackAudioPreview.release();
  };

  const isRecorderReleased = async (recording: Audio.Recording): Promise<boolean> => {
    try {
      const status = await recording.getStatusAsync();
      return status.isDoneRecording === true && status.canRecord === false;
    } catch {
      return false;
    }
  };

  const stopFeedbackAudioRecording = async (requireSuspension = false): Promise<void> => {
    if (feedbackAudioStopInFlightRef.current) {
      await feedbackAudioStopInFlightRef.current;
      if (requireSuspension && feedbackAudioRecordingRef.current) {
        await stopFeedbackAudioRecording(true);
      }
      return;
    }
    const recording = feedbackAudioRecordingRef.current;
    if (!recording) {
      await restoreFeedbackAudioPlaybackMode();
      return;
    }

    clearFeedbackAudioTimer();
    const contextGeneration = feedbackAudioRecordingContextRef.current;

    const stop: Promise<void> = (async () => {
      try {
        // Native stop returns the final duration and unloads the recorder itself; a separate
        // status read is unnecessary and must never get in the way of releasing the mic.
        const status = await recording.stopAndUnloadAsync();
        const canDraft = feedbackAudioRecordingCanDraftRef.current;
        if (feedbackAudioRecordingRef.current === recording) {
          feedbackAudioRecordingRef.current = null;
          feedbackAudioRecordingCanDraftRef.current = false;
        }
        if (!canDraft || contextGeneration !== feedbackAudioContextGenerationRef.current) return;
        const elapsedMs = feedbackAudioElapsedMsRef.current;
        const durationMs =
          typeof status.durationMillis === 'number' ? status.durationMillis : elapsedMs;
        const uri = recording.getURI();

        if (!uri) {
          setFeedbackAudioState('error');
          setFeedbackSubmitError(t('bible.chapterFeedbackAudioRecordingMissing'));
          return;
        }

        setFeedbackAudioDraft({
          uri,
          durationMs: Math.max(durationMs, elapsedMs),
          mimeType: CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
        });
        updateFeedbackAudioElapsedMs(Math.max(durationMs, elapsedMs));
        setFeedbackAudioState('preview');
      } catch (error) {
        // The recorder's own error message is an English diagnostic, not reader copy.
        if (contextGeneration === feedbackAudioContextGenerationRef.current) {
          setFeedbackAudioState('error');
          setFeedbackSubmitError(t('bible.chapterFeedbackAudioStopError'));
        }
        // Expo AV can reject E_AUDIO_NODATA only after it has unloaded the
        // recorder. Check its post-stop state so that empty audio is discarded
        // without leaving every later narration claim blocked on a dead ref.
        const released = await isRecorderReleased(recording);
        if (released && feedbackAudioRecordingRef.current === recording) {
          feedbackAudioRecordingRef.current = null;
          feedbackAudioRecordingCanDraftRef.current = false;
        }
        if (requireSuspension && !released) throw error;
      } finally {
        await restoreFeedbackAudioPlaybackMode();
      }
    })().finally(() => {
      if (feedbackAudioStopInFlightRef.current === stop)
        feedbackAudioStopInFlightRef.current = null;
    });
    feedbackAudioStopInFlightRef.current = stop;
    await stop;
  };

  const drainFeedbackAudio = (): Promise<void> => {
    feedbackAudioRecordingRequestRef.current += 1;
    clearFeedbackAudioTimer();
    if (feedbackAudioSuspendRef.current) return feedbackAudioSuspendRef.current;
    const release = feedbackAudioPreview.release();
    void release.catch(() => undefined);
    const pendingNativeStart = feedbackAudioNativeStartRef.current;
    const pendingPreview = feedbackAudioPreviewOperationRef.current;
    const drain = (async () => {
      // Only native setup is awaited: a Record request waiting on a previous
      // narration claim must not form a cycle with this takeover.
      await Promise.allSettled([pendingNativeStart, pendingPreview].filter((pending) => pending));
      // A preview may materialize only after its pending native create returns.
      const finalRelease = feedbackAudioPreview.release();
      const stopped =
        feedbackAudioRecordingRef.current || feedbackAudioStopInFlightRef.current
          ? stopFeedbackAudioRecording(true)
          : Promise.resolve();
      const results = await Promise.allSettled([release, finalRelease, stopped]);
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    })();
    feedbackAudioSuspendRef.current = drain;
    void drain
      .finally(() => {
        if (feedbackAudioSuspendRef.current === drain) feedbackAudioSuspendRef.current = null;
      })
      .catch(() => undefined);
    return drain;
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
    setIsFeedbackAudioStarting(true);
    const request = feedbackAudioRecordingRequestRef.current;
    const claim = claimNarration('feedback', feedbackAudioPreview, drainFeedbackAudio);
    feedbackAudioClaimRef.current = claim;
    const isAbandoned = () =>
      request !== feedbackAudioRecordingRequestRef.current || !claim.isCurrent();
    try {
      await claim.ready;
      if (isAbandoned()) return;
      // A previous stop still owns its draft and audio-mode completion. Drain it before
      // asking Expo AV to create another recorder (only one may be prepared at a time).
      await feedbackAudioStopInFlightRef.current;
      if (isAbandoned()) return;
      if (feedbackAudioRecordingRef.current) {
        await stopFeedbackAudioRecording(true);
        if (isAbandoned()) return;
      }
      await stopFeedbackAudioPreview();
      if (isAbandoned()) return;
      setFeedbackSubmitError(null);
      setFeedbackAudioPermissionDenied(false);

      try {
        // iOS turns the app inactive under the microphone prompt; that must not lock
        // discreet mode mid-recording.
        const permission = await withPrivacyLockGrace(() => Audio.requestPermissionsAsync());
        if (isAbandoned()) {
          return;
        }
        if (!permission.granted) {
          setFeedbackAudioPermissionDenied(true);
          setFeedbackAudioState('error');
          setFeedbackSubmitError(t('bible.chapterFeedbackAudioPermissionDenied'));
          return;
        }

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
        const nativeStart = (async () => {
          let recording: Audio.Recording | null = null;
          let prepared = false;
          try {
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
            });
            if (isAbandoned()) {
              await restoreFeedbackAudioPlaybackMode();
              return;
            }
            recording = new Audio.Recording();
            feedbackAudioRecordingRef.current = recording;
            feedbackAudioRecordingContextRef.current = feedbackAudioContextGenerationRef.current;
            feedbackAudioRecordingCanDraftRef.current = false;
            // Expo's createAsync does not await cleanup when startAsync rejects.
            // Keep the instance here so takeover and a retry can drain it first.
            await recording.prepareToRecordAsync({
              ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
              keepAudioActiveHint: true,
            });
            prepared = true;
            if (isAbandoned()) return;
            await recording.startAsync();
          } catch (error) {
            if (recording) {
              const status = await recording.getStatusAsync().catch(() => null);
              if (prepared || status?.canRecord === true) {
                try {
                  await recording.stopAndUnloadAsync();
                } catch {
                  // Android E_AUDIO_NODATA may reject after native unload.
                }
              }
              if (
                feedbackAudioRecordingRef.current === recording &&
                (status?.canRecord === false || (await isRecorderReleased(recording)))
              ) {
                feedbackAudioRecordingRef.current = null;
                feedbackAudioRecordingCanDraftRef.current = false;
              }
            }
            await restoreFeedbackAudioPlaybackMode();
            throw error;
          }
        })();
        feedbackAudioNativeStartRef.current = nativeStart;
        try {
          await nativeStart;
        } finally {
          if (feedbackAudioNativeStartRef.current === nativeStart) {
            feedbackAudioNativeStartRef.current = null;
          }
        }
        if (isAbandoned()) return;

        feedbackAudioRecordingCanDraftRef.current = true;
        setFeedbackAudioDraft(null);
        updateFeedbackAudioElapsedMs(0);
        feedbackAudioStartedAtRef.current = Date.now();
        setFeedbackAudioState('recording');
        feedbackAudioTimerRef.current = setInterval(() => {
          if (isAbandoned()) return;
          const elapsedMs = feedbackAudioStartedAtRef.current
            ? Date.now() - feedbackAudioStartedAtRef.current
            : 0;
          updateFeedbackAudioElapsedMs(Math.min(elapsedMs, CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS));

          if (elapsedMs >= CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS) {
            void stopFeedbackAudioRecording();
          }
        }, CHAPTER_FEEDBACK_AUDIO_TIMER_MS);
      } catch {
        clearFeedbackAudioTimer();
        if (isAbandoned()) {
          return;
        }
        setFeedbackAudioState('error');
        setFeedbackSubmitError(t('bible.chapterFeedbackAudioStartError'));
      }
    } catch {
      if (!isAbandoned()) {
        setFeedbackAudioState('error');
        setFeedbackSubmitError(t('bible.chapterFeedbackAudioStartError'));
      }
    } finally {
      feedbackAudioStartInFlightRef.current = false;
      setIsFeedbackAudioStarting(false);
    }
  };

  const playFeedbackAudioPreview = async () => {
    if (!feedbackAudioDraft) {
      return;
    }

    const claim = claimNarration('feedback', feedbackAudioPreview, drainFeedbackAudio);
    feedbackAudioClaimRef.current = claim;
    try {
      await claim.ready;
      if (!claim.isCurrent()) return;
      // Every tap replays from the start: release the previous preview, then load anew.
      await stopFeedbackAudioPreview();
      if (!claim.isCurrent()) return;
      const { uri } = feedbackAudioDraft;
      const operation = feedbackAudioPreview.play(async () => {
        await restoreFeedbackAudioPlaybackMode();
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
        return sound;
      });
      feedbackAudioPreviewOperationRef.current = operation;
      let played: boolean;
      try {
        played = await operation;
      } finally {
        if (feedbackAudioPreviewOperationRef.current === operation) {
          feedbackAudioPreviewOperationRef.current = null;
        }
      }
      const sound = feedbackAudioPreview.getSound();
      if (!played || !sound || !claim.isCurrent()) {
        return;
      }
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || !status.didJustFinish) return;
        // An older preview finishing must not take the current one down.
        if (feedbackAudioPreview.getSound() === sound) {
          void feedbackAudioPreview.release().catch(() => undefined);
        }
      });
    } catch {
      // Keep the draft and Preview control available for a retry.
    }
  };

  const discardFeedbackAudioDraft = () => {
    void stopFeedbackAudioPreview().catch(() => undefined);
    setFeedbackAudioDraft(null);
    updateFeedbackAudioElapsedMs(0);
    setFeedbackAudioState('idle');
    setFeedbackAudioPermissionDenied(false);
    setFeedbackSubmitError(null);
  };

  /** Closing or leaving the composer keeps its draft, but releases native audio. */
  const suspendFeedbackAudio = useLatestCallback(async () => {
    feedbackAudioClaimRef.current?.cancel();
    // Closing the composer has no caller to receive teardown failures. The
    // ownership coordinator retains a failed native drain for the next claim.
    await drainFeedbackAudio().catch(() => undefined);
  });

  useFocusEffect(
    useCallback(() => {
      return () => {
        void suspendFeedbackAudio();
      };
    }, [suspendFeedbackAudio])
  );

  /** The voice-note half of clearing the composer after a submit. */
  const resetFeedbackAudio = useLatestCallback(() => {
    // Reset cancels preparation as well as active audio. Its native teardown may
    // finish later, but cannot turn an obsolete recording into a fresh draft.
    feedbackAudioRecordingCanDraftRef.current = false;
    void suspendFeedbackAudio();
    setFeedbackAudioDraft(null);
    updateFeedbackAudioElapsedMs(0);
    setFeedbackAudioState('idle');
    setFeedbackAudioPermissionDenied(false);
  });

  useLayoutEffect(() => {
    if (feedbackAudioContextRef.current === contextKey) return;
    feedbackAudioContextRef.current = contextKey;
    feedbackAudioContextGenerationRef.current += 1;
    resetFeedbackAudio();
    setIsFeedbackAudioStarting(false);
  }, [contextKey, resetFeedbackAudio]);

  // Hide the old voice note in the first render of a replacement chapter or
  // account; native teardown begins at commit and may finish asynchronously.
  const isCurrentContext = feedbackAudioContextRef.current === contextKey;
  return {
    feedbackAudioState: isCurrentContext ? feedbackAudioState : 'idle',
    setFeedbackAudioState,
    feedbackAudioDraft: isCurrentContext ? feedbackAudioDraft : null,
    feedbackAudioElapsedMs: isCurrentContext ? feedbackAudioElapsedMs : 0,
    feedbackAudioPermissionDenied: isCurrentContext && feedbackAudioPermissionDenied,
    isFeedbackAudioStarting: isCurrentContext && isFeedbackAudioStarting,
    startFeedbackAudioRecording,
    stopFeedbackAudioRecording,
    playFeedbackAudioPreview,
    discardFeedbackAudioDraft,
    suspendFeedbackAudio,
    resetFeedbackAudio,
  };
}

export type ChapterFeedbackAudio = ReturnType<typeof useChapterFeedbackAudio>;
