import { Platform } from 'react-native';
import { getTranslatedBookName } from '../../constants';
import { clearBibleNowPlaying, syncBibleNowPlaying } from '../../services/audio';
import type {
  BibleNowPlayingInput,
  BibleNowPlayingLocalizedStrings,
} from '../../services/audio/audioNowPlayingModel';
import { bibleNowPlayingSignature } from '../../services/audio/audioNowPlayingSignatureModel';
import type { AudioChapterMap } from '../../services/bible/contentAvailability';
import { useAudioStore } from '../../stores/audioStore';
import { useBibleStore } from '../../stores/bibleStore';
import type { AudioPlayerSession, Translate } from './playerSession';
import { getAdjacentAudioChapter } from './useAudioCoverage';

export interface NowPlayingSyncContext {
  session: AudioPlayerSession;
  t: Translate;
  fallbackTranslationId: string;
  peekAudioCoverage: (translationId: string) => AudioChapterMap | undefined;
}

/** Clears the lock-screen entry, so the next sync publishes even an unchanged one. */
export function clearPlayerNowPlaying(session: AudioPlayerSession): void {
  session.lastNowPlayingSignature = null;
  void clearBibleNowPlaying();
}

/**
 * Publishes the lock-screen / notification entry for the current chapter, with any
 * overrides applied. Skipped when nothing visible changed since the last publish,
 * unless forced.
 */
export function syncPlayerNowPlaying(
  { session, t, fallbackTranslationId, peekAudioCoverage }: NowPlayingSyncContext,
  overrides: Partial<BibleNowPlayingInput> = {},
  force = false
): void {
  const state = useAudioStore.getState();
  const resolvedTranslationId =
    overrides.translationId ?? state.currentTranslationId ?? fallbackTranslationId;
  const resolvedBookId = overrides.bookId ?? state.currentBookId;
  const resolvedChapter = overrides.chapter ?? state.currentChapter;

  if (!resolvedBookId || !resolvedChapter) {
    clearPlayerNowPlaying(session);
    return;
  }

  const resolvedPositionMs = overrides.positionMs ?? state.currentPosition;
  const resolvedDurationMs = overrides.durationMs ?? state.duration;
  const resolvedIsPlaying = overrides.isPlaying ?? state.status === 'playing';
  const resolvedPlaybackRate = overrides.playbackRate ?? state.playbackRate ?? 1;
  // Look up translation name from bibleStore so runtime (catalog) translations
  // — which are absent from the static constants — still appear on the lock screen.
  const resolvedTranslationName =
    overrides.translationName ??
    useBibleStore.getState().translations.find((t) => t.id === resolvedTranslationId)?.name;

  // Compute skip availability so the lock screen next/previous buttons reflect
  // whether adjacent chapters actually exist. Queue entries take priority over
  // the linear chapter adjacency check, and an exact chapter map (Every Language)
  // decides for translations whose audio skips books and chapters.
  const coverage = peekAudioCoverage(resolvedTranslationId);
  const resolvedAdjacentChapter = (direction: -1 | 1) =>
    getAdjacentAudioChapter(resolvedBookId, resolvedChapter, direction, coverage);
  const resolvedCanSkipNext =
    overrides.canSkipNext ??
    Boolean(state.queue[state.queueIndex + 1] ?? resolvedAdjacentChapter(1));
  const resolvedCanSkipPrevious =
    overrides.canSkipPrevious ??
    Boolean(state.queue[state.queueIndex - 1] ?? resolvedAdjacentChapter(-1));
  // Both lock screens title the entry with the book in the interface language.
  const bookName = getTranslatedBookName(resolvedBookId, t);
  // Android builds its media notification from JS, so it also needs the control
  // labels in the interface language. iOS publishes those natively.
  const localized: BibleNowPlayingLocalizedStrings | undefined =
    Platform.OS === 'android'
      ? {
          bookName,
          channelName: t('audio.nowPlaying'),
          play: t('interface.playChapterAudio'),
          pause: t('interface.pauseChapterAudio'),
          previous: t('audio.previousChapter'),
          next: t('audio.nextChapter'),
          skipBackward: t('audio.skipBackward'),
          skipForward: t('audio.skipForward'),
        }
      : undefined;
  // iOS publishes the entry natively; in discreet mode this neutral title replaces the
  // chapter there (Android uses `localized.channelName`).
  const discreetTitle = Platform.OS === 'ios' ? t('audio.nowPlaying') : undefined;

  const signature = bibleNowPlayingSignature({
    translationId: resolvedTranslationId,
    bookId: resolvedBookId,
    bookName,
    chapter: resolvedChapter,
    positionMs: resolvedPositionMs,
    durationMs: resolvedDurationMs,
    isPlaying: resolvedIsPlaying,
    playbackRate: resolvedPlaybackRate,
    canSkipNext: resolvedCanSkipNext,
    canSkipPrevious: resolvedCanSkipPrevious,
  });

  if (!force && session.lastNowPlayingSignature === signature) {
    return;
  }

  session.lastNowPlayingSignature = signature;
  void syncBibleNowPlaying({
    translationId: resolvedTranslationId,
    translationName: resolvedTranslationName,
    bookId: resolvedBookId,
    bookName,
    chapter: resolvedChapter,
    positionMs: resolvedPositionMs,
    durationMs: resolvedDurationMs,
    isPlaying: resolvedIsPlaying,
    playbackRate: resolvedPlaybackRate,
    canSkipNext: resolvedCanSkipNext,
    canSkipPrevious: resolvedCanSkipPrevious,
    ...(localized ? { localized } : {}),
    ...(discreetTitle ? { discreetTitle } : {}),
  });
}
