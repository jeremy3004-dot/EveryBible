import type { PassageBlock } from './gatherBibleService';
import type { BibleReference } from '../../types/gather';

/** A chapter recording a lesson can play or share. */
export interface LessonAudioSource {
  translationId: string;
  bookId: string;
  chapter: number;
  url: string;
}

/**
 * Translations to ask for a lesson's audio, in order. The reading translation
 * always comes first (an audio-only translation should still speak in the
 * reader's language). When the primary passage was borrowed from the bundled
 * fallback, that translation follows, so the story on screen can also be heard.
 */
export function lessonAudioTranslationCandidates(
  blocks: readonly PassageBlock[],
  readingTranslationId: string
): string[] {
  const primary = blocks[0];
  if (primary && primary.verses.length > 0 && primary.translationId !== readingTranslationId) {
    return [readingTranslationId, primary.translationId];
  }
  return [readingTranslationId];
}

/**
 * The first candidate translation with audio for the lesson's primary (first)
 * chapter. A lookup that throws counts as "no audio" for that translation
 * rather than hiding the next one.
 */
export async function resolveLessonAudio(
  references: readonly BibleReference[],
  candidates: readonly string[],
  resolveAudioUrl: (
    translationId: string,
    bookId: string,
    chapter: number
  ) => Promise<{ url: string } | null>
): Promise<LessonAudioSource | null> {
  const primary = references[0];
  if (!primary) {
    return null;
  }
  for (const translationId of candidates) {
    try {
      const asset = await resolveAudioUrl(translationId, primary.bookId, primary.chapter);
      if (asset?.url) {
        return { translationId, bookId: primary.bookId, chapter: primary.chapter, url: asset.url };
      }
    } catch {
      // Try the next translation.
    }
  }
  return null;
}
