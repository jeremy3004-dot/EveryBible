import type { BibleTranslation, DailyScripture, DailyScriptureReference, Verse } from '../../types';

export type ChapterPresentationMode = 'text' | 'audio-first' | 'empty';

interface ChapterPresentationOptions {
  verses: Verse[];
  translation?: Pick<BibleTranslation, 'hasText' | 'hasAudio' | 'audioGranularity'>;
  audioAvailable: boolean;
}

interface BuildDailyScriptureOptions {
  reference: DailyScriptureReference;
  verse: Verse | null;
  translation?: Pick<BibleTranslation, 'hasAudio' | 'audioGranularity'>;
  audioAvailable: boolean;
}

export function getChapterPresentationMode({
  verses,
  translation,
  audioAvailable,
}: ChapterPresentationOptions): ChapterPresentationMode {
  if (verses.length > 0) {
    return 'text';
  }

  if (translation?.hasAudio && audioAvailable) {
    return 'audio-first';
  }

  return 'empty';
}

export function buildDailyScripture({
  reference,
  verse,
  translation,
  audioAvailable,
}: BuildDailyScriptureOptions): DailyScripture {
  if (verse?.text?.trim()) {
    return {
      kind: 'verse-text',
      bookId: reference.bookId,
      chapter: reference.chapter,
      verse: reference.verse,
      text: verse.text,
      playScope: 'none',
    };
  }

  if (translation?.hasAudio && audioAvailable) {
    const playScope = translation.audioGranularity === 'verse' ? 'verse' : 'chapter';

    return {
      kind: playScope === 'verse' ? 'verse-audio' : 'section-audio',
      bookId: reference.bookId,
      chapter: reference.chapter,
      verse: reference.verse,
      text: null,
      playScope,
    };
  }

  return {
    kind: 'empty',
    bookId: reference.bookId,
    chapter: reference.chapter,
    verse: reference.verse,
    text: null,
    playScope: 'none',
  };
}
