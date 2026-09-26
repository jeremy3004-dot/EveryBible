import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  SleepTimerOption,
} from '../../../types/audio';

export type PlaybackControlsVariant = 'default' | 'chapter-only' | 'utilities-only';

export interface PlaybackControlsLayout {
  /** The play/pause row; the utilities-only variant (the reader's audio sheet) drops it. */
  showTransport: boolean;
  /** Previous/next chapter; only the chapter-only transport may hide them. */
  showChapterButtons: boolean;
  /** The 10-second skips belong to the default player only. */
  showSkipControls: boolean;
  /** The listen page's larger transport. */
  isChapterOnly: boolean;
}

export function playbackControlsLayout(
  variant: PlaybackControlsVariant,
  showChapterNavigation: boolean
): PlaybackControlsLayout {
  const isChapterOnly = variant === 'chapter-only';
  return {
    showTransport: variant !== 'utilities-only',
    showChapterButtons: !isChapterOnly || showChapterNavigation,
    showSkipControls: variant === 'default',
    isChapterOnly,
  };
}

export function repeatLabelKey(mode: RepeatMode): string {
  if (mode === 'chapter') return 'audio.repeatChapter';
  if (mode === 'book') return 'audio.repeatBook';
  return 'audio.repeatOff';
}

/** "1.25x": the speed button's text and value, and each speed row's name. */
export function formatPlaybackRate(rate: PlaybackRate): string {
  return `${rate}x`;
}

/** The chosen layer's catalogue id; an id no longer in the catalogue reads as the first entry. */
export function selectedBackgroundMusicId(
  choice: BackgroundMusicChoice,
  options: ReadonlyArray<{ id: BackgroundMusicChoice }>
): BackgroundMusicChoice | undefined {
  return (options.find((option) => option.id === choice) ?? options[0])?.id;
}

export interface SleepTimerOptionLabel {
  key: string;
  count?: number;
}

/** "Off" for no timer, else the short minutes label. */
export function sleepTimerOptionLabel(value: SleepTimerOption): SleepTimerOptionLabel {
  if (value == null) return { key: 'interface.music.off.label' };
  if (value === 'end-of-chapter') return { key: 'audio.sleepTimerEndOfChapter' };
  return { key: 'interface.minutesShort', count: value };
}
