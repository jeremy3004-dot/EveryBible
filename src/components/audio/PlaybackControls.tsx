import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../types';
import { mediumHaptic } from '../../utils';
import { AudioPlaybackErrorNotice } from './AudioPlaybackErrorNotice';
import {
  BackgroundMusicButton,
  BackgroundMusicSheet,
  ChapterButton,
  PlayButton,
  PlaybackSpeedSheet,
  playbackControlsLayout,
  playbackControlsStyles as styles,
  RepeatButton,
  ShareAudioButton,
  ShowTextButton,
  SkipButton,
  SleepTimerButton,
  SleepTimerSheet,
  SpeedButton,
  useLatestCallback,
  type PlaybackControlsVariant,
} from './playbackControlsParts';

interface PlaybackControlsProps {
  variant?: PlaybackControlsVariant;
  status: AudioStatus;
  /** Why the chapter failed to play, shown under the transport; Play tries again. */
  errorMessage?: string | null;
  playbackRate: PlaybackRate;
  repeatMode: RepeatMode;
  sleepTimerRemaining: number | null;
  backgroundMusicChoice: BackgroundMusicChoice;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  onPlayPause: () => void;
  showChapterNavigation?: boolean;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onChangePlaybackRate: (rate: PlaybackRate) => void;
  onCycleRepeatMode: () => void;
  onSetSleepTimer: (minutes: SleepTimerOption) => void;
  onChangeBackgroundMusicChoice: (choice: BackgroundMusicChoice) => void;
  onShowText?: () => void;
  showTextLabel?: string;
  onShareAudio?: () => void;
  showUtilityRow?: boolean;
  footer?: ReactNode;
  /**
   * A control beside the transport (the listen screen's Selah button). Its slot is
   * mirrored on the other side, so the transport stays centred when it renders nothing.
   */
  transportAccessory?: ReactNode;
}

const noop = () => {};

/**
 * The audio transport (chapter, 10-second skip and play buttons) and the utility
 * pills (sleep timer, background music, repeat, speed, text, share) with their
 * option sheets. Callers pass fresh inline handlers on every render; they are
 * held behind stable wrappers so each memoised control redraws only when its own
 * values change (see playbackControlsParts/).
 */
export function PlaybackControls({
  variant = 'default',
  status,
  errorMessage = null,
  playbackRate,
  repeatMode,
  sleepTimerRemaining,
  backgroundMusicChoice,
  hasPreviousChapter,
  hasNextChapter,
  onPlayPause,
  showChapterNavigation = true,
  onPreviousChapter,
  onNextChapter,
  onSkipBackward,
  onSkipForward,
  onChangePlaybackRate,
  onCycleRepeatMode,
  onSetSleepTimer,
  onChangeBackgroundMusicChoice,
  onShowText,
  showTextLabel,
  onShareAudio,
  showUtilityRow = true,
  footer,
  transportAccessory,
}: PlaybackControlsProps) {
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showBackgroundMusicModal, setShowBackgroundMusicModal] = useState(false);

  const layout = playbackControlsLayout(variant, showChapterNavigation);
  const isLoading = status === 'loading';

  const playPause = useLatestCallback(() => {
    mediumHaptic();
    onPlayPause();
  });
  const previousChapter = useLatestCallback(onPreviousChapter);
  const nextChapter = useLatestCallback(onNextChapter);
  const skipBackward = useLatestCallback(onSkipBackward);
  const skipForward = useLatestCallback(onSkipForward);
  const changePlaybackRate = useLatestCallback(onChangePlaybackRate);
  const cycleRepeatMode = useLatestCallback(onCycleRepeatMode);
  const setSleepTimer = useLatestCallback(onSetSleepTimer);
  const changeBackgroundMusic = useLatestCallback(onChangeBackgroundMusicChoice);
  const showText = useLatestCallback(onShowText ?? noop);
  const shareAudio = useLatestCallback(onShareAudio ?? noop);

  const openTimer = useCallback(() => setShowTimerModal(true), []);
  const closeTimer = useCallback(() => setShowTimerModal(false), []);
  const openSpeed = useCallback(() => setShowSpeedModal(true), []);
  const closeSpeed = useCallback(() => setShowSpeedModal(false), []);
  const openMusic = useCallback(() => setShowBackgroundMusicModal(true), []);
  const closeMusic = useCallback(() => setShowBackgroundMusicModal(false), []);

  return (
    <View style={styles.container}>
      <View
        style={[styles.transportRow, layout.isChapterOnly ? styles.chapterOnlyTransportRow : null]}
      >
        {transportAccessory !== undefined ? <View style={styles.transportAccessorySlot} /> : null}
        {layout.showChapterButtons ? (
          <ChapterButton
            direction="previous"
            hasChapter={hasPreviousChapter}
            isLoading={isLoading}
            isChapterOnly={layout.isChapterOnly}
            onPress={previousChapter}
          />
        ) : null}
        {layout.showSkipControls ? (
          <SkipButton direction="backward" isLoading={isLoading} onPress={skipBackward} />
        ) : null}
        <PlayButton
          isLoading={isLoading}
          isPlaying={status === 'playing'}
          isChapterOnly={layout.isChapterOnly}
          onPress={playPause}
        />
        {layout.showSkipControls ? (
          <SkipButton direction="forward" isLoading={isLoading} onPress={skipForward} />
        ) : null}
        {layout.showChapterButtons ? (
          <ChapterButton
            direction="next"
            hasChapter={hasNextChapter}
            isLoading={isLoading}
            isChapterOnly={layout.isChapterOnly}
            onPress={nextChapter}
          />
        ) : null}
        {transportAccessory !== undefined ? (
          <View style={styles.transportAccessorySlot}>{transportAccessory}</View>
        ) : null}
      </View>

      {errorMessage ? <AudioPlaybackErrorNotice message={errorMessage} /> : null}

      {showUtilityRow ? (
        <View
          style={[styles.utilityRow, layout.isChapterOnly ? styles.chapterOnlyUtilityRow : null]}
        >
          <View style={styles.utilityPrimaryGroup}>
            <SleepTimerButton remainingMinutes={sleepTimerRemaining} onPress={openTimer} />
            <BackgroundMusicButton choice={backgroundMusicChoice} onPress={openMusic} />
            <RepeatButton repeatMode={repeatMode} onCycle={cycleRepeatMode} />
            <SpeedButton rate={playbackRate} onPress={openSpeed} />
            {onShowText ? (
              <ShowTextButton
                label={showTextLabel}
                isChapterOnly={layout.isChapterOnly}
                onPress={showText}
              />
            ) : null}
            {onShareAudio ? <ShareAudioButton onPress={shareAudio} /> : null}
          </View>
        </View>
      ) : null}

      {footer}

      <BackgroundMusicSheet
        visible={showBackgroundMusicModal}
        onClose={closeMusic}
        onSelect={changeBackgroundMusic}
        choice={backgroundMusicChoice}
      />
      <PlaybackSpeedSheet
        visible={showSpeedModal}
        onClose={closeSpeed}
        onSelect={changePlaybackRate}
        rate={playbackRate}
      />
      <SleepTimerSheet
        visible={showTimerModal}
        onClose={closeTimer}
        onSelect={setSleepTimer}
        remainingMinutes={sleepTimerRemaining}
      />
    </View>
  );
}
