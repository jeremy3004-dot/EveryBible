import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { getAdjacentBibleChapter, getTranslatedBookName } from '../../constants/books';
import { useSelah } from '../../hooks/audioPlayer/useSelah';
import {
  stepActivePlayback,
  toggleActivePlayback,
} from '../../hooks/audioPlayer/transportRegistry';
import { useAudioStore } from '../../stores/audioStore';
import { useReaderPlayerBarStore } from '../../stores/readerPlayerBarStore';
import type { BackgroundMusicChoice } from '../../types/audio';
import { rootNavigationRef } from '../rootNavigation';
import {
  getReturnToReaderTarget,
  isAudioSessionActive,
  type PlayerBarScope,
} from './playerBarModel';

/** Everything the player row draws and does, whichever screen it serves. */
export interface PlayerBarController {
  scope: PlayerBarScope;
  /** The play/pause glyph shows pause (a loading chapter is on its way to playing). */
  showsPause: boolean;
  isLoading: boolean;
  showPlayButton: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  nextIsCompletion: boolean;
  nextAccessibilityLabel: string;
  nextAccessibilityHint: string | undefined;
  soundChoice: BackgroundMusicChoice;
  soundAccessibilityLabel: string;
  soundAccessibilityHint: string;
  errorMessage: string | null;
  /** The loaded chapter's progress belongs on this bar. */
  showsProgress: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSound: () => void;
  /** A tap on the row's empty space (other tabs only: back to what is playing). */
  onRowPress: (() => void) | null;
}

export interface PlayerBarState {
  /** Null when the bar shows only its tab row. */
  controller: PlayerBarController | null;
  /** A chapter is loaded, so scrolling shrinks the bar into the strip instead of hiding it. */
  audioLoaded: boolean;
  isSelahActive: boolean;
}

/** Back to the chapter that is playing, in its translation and plan or rhythm session. */
export function returnToPlayingChapter(): void {
  if (!rootNavigationRef.isReady()) return;
  const audio = useAudioStore.getState();
  // Loaded on the press, not with the tab bar: the Bible store stays off the boot path.
  const { useBibleStore } =
    require('../../stores/bibleStore') as typeof import('../../stores/bibleStore');
  const bible = useBibleStore.getState();
  const target = getReturnToReaderTarget({
    currentTranslationId: audio.currentTranslationId,
    currentBookId: audio.currentBookId,
    currentChapter: audio.currentChapter,
    lastPlayedTranslationId: audio.lastPlayedTranslationId,
    audioReturnTarget: audio.audioReturnTarget,
    currentTranslation: bible.currentTranslation,
  });
  if (!target) return;
  if (target.translationId) {
    bible.setCurrentTranslation(target.translationId);
  }
  rootNavigationRef.navigate('Bible', { screen: 'BibleReader', params: target.params });
}

/**
 * The player row's state for the screen the bar is under. On the reader it is the
 * reader's own transport, as the reader published it. Anywhere else it is the
 * playing session, shown only while there is one. Selects transport state only:
 * the playback position reaches the progress line alone.
 */
export function usePlayerBarController(scope: PlayerBarScope): PlayerBarState {
  const { t } = useTranslation();
  const { isSelahActive, toggleSelah } = useSelah();
  const reader = useReaderPlayerBarStore(
    useShallow((state) => ({ controls: state.controls, actions: state.actions }))
  );
  const audio = useAudioStore(
    useShallow((state) => ({
      status: state.status,
      currentBookId: state.currentBookId,
      currentChapter: state.currentChapter,
      backgroundMusicChoice: state.backgroundMusicChoice,
    }))
  );
  const audioLoaded = isAudioSessionActive(audio.status, audio.currentBookId, audio.currentChapter);
  const soundName = t(`interface.music.${audio.backgroundMusicChoice}.label`);

  const controller = useMemo((): PlayerBarController | null => {
    // Play while Selah holds the narration brings the reading back in, not a toggle.
    const playOrLeaveSelah = (play: () => void) => () => {
      if (isSelahActive) {
        toggleSelah();
        return;
      }
      play();
    };

    if (scope === 'reader') {
      const { controls, actions } = reader;
      if (!controls || !actions || !controls.showsPlayer) return null;
      return {
        scope,
        showsPause: !isSelahActive && (controls.isPlaying || controls.isLoading),
        isLoading: controls.isLoading,
        showPlayButton: controls.showPlayButton,
        hasPrevious: controls.hasPrevious,
        hasNext: controls.hasNext,
        nextIsCompletion: controls.nextIsCompletion,
        nextAccessibilityLabel: controls.nextAccessibilityLabel,
        nextAccessibilityHint: controls.nextAccessibilityHint ?? undefined,
        soundChoice: audio.backgroundMusicChoice,
        soundAccessibilityLabel: t('audio.playerBar.sound', { name: soundName }),
        soundAccessibilityHint: t('audio.playerBar.soundHint'),
        errorMessage: controls.errorMessage,
        showsProgress: controls.showsProgress,
        onPlayPause: playOrLeaveSelah(actions.playPause),
        onPrevious: actions.previous,
        onNext: actions.next,
        onSound: actions.openAudioSheet,
        onRowPress: null,
      };
    }

    const { status, currentBookId, currentChapter } = audio;
    if (!audioLoaded || !currentBookId || currentChapter == null) return null;
    const reference = `${getTranslatedBookName(currentBookId, t)} ${currentChapter}`;
    return {
      scope,
      showsPause: !isSelahActive && (status === 'playing' || status === 'loading'),
      isLoading: status === 'loading',
      showPlayButton: true,
      hasPrevious: getAdjacentBibleChapter(currentBookId, currentChapter, -1) != null,
      hasNext: getAdjacentBibleChapter(currentBookId, currentChapter, 1) != null,
      nextIsCompletion: false,
      nextAccessibilityLabel: t('audio.nextChapter'),
      nextAccessibilityHint: undefined,
      soundChoice: audio.backgroundMusicChoice,
      soundAccessibilityLabel: t('audio.playerBar.nowPlaying', { reference }),
      soundAccessibilityHint: t('audio.playerBar.returnHint'),
      errorMessage: null,
      showsProgress: true,
      onPlayPause: playOrLeaveSelah(() => void toggleActivePlayback()),
      onPrevious: () => void stepActivePlayback(-1),
      onNext: () => void stepActivePlayback(1),
      onSound: returnToPlayingChapter,
      onRowPress: returnToPlayingChapter,
    };
  }, [audio, audioLoaded, isSelahActive, reader, scope, soundName, t, toggleSelah]);

  return { controller, audioLoaded, isSelahActive };
}
