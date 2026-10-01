import { useEffect, useState } from 'react';
import type { PassageReferenceTarget } from '../../../services/bible/referenceParser';

/**
 * The text of the verse a typed reference points at ("John 3:16"), in the given translation,
 * for the reference card to show instead of a bare "Chapter 3 • Verse 16". Null while it loads,
 * when the reference names a whole chapter, or when the translation has no text for it, so the
 * card keeps its label. The chapter service is imported on demand, like the full-text search,
 * to stay out of the browser's first render.
 */
export function useReferenceVersePreview(
  target: PassageReferenceTarget,
  translationId: string
): string | null {
  const { bookId, chapter, focusVerse } = target;
  const [preview, setPreview] = useState<{ key: string; text: string } | null>(null);
  const key = `${translationId}:${bookId}:${chapter}:${focusVerse ?? ''}`;

  useEffect(() => {
    if (!focusVerse) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      try {
        const { getChapter } = await import('../../../services/bible/bibleService');
        const verses = await getChapter(translationId, bookId, chapter);
        const text = verses.find((verse) => verse.verse === focusVerse)?.text.trim();
        if (!isCancelled && text) {
          setPreview({ key, text });
        }
      } catch {
        // The label is a complete answer on its own; a failed read just leaves it.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [bookId, chapter, focusVerse, translationId, key]);

  // Gate at render time so a previous reference's verse never shows under a new label.
  return preview?.key === key ? preview.text : null;
}
