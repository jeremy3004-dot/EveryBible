import { useEffect, useMemo, useState } from 'react';
import {
  buildAudioChapterMapFromElManifest,
  type AudioChapterMap,
  type TranslationContentSummary,
} from '../services/bible/contentAvailability';
import type { BibleTranslation } from '../types';

interface ResolvedChapterMap {
  key: string;
  chapters: AudioChapterMap;
}

/**
 * The availability view of a translation for the Bible browser.
 *
 * Every Language entries describe their audio only through a signed manifest — the
 * catalog row has no coverage or per-book data — so without this the browser would
 * offer all 66 books of an audio set that covers nineteen. The manifest is cached
 * memory → disk → network by the manifest service; until it resolves (or if it never
 * does) the plain translation is returned and the browser stays optimistic.
 */
export function useTranslationContentSummary(
  translation: BibleTranslation | undefined
): TranslationContentSummary | undefined {
  const audio = translation?.catalog?.audio;
  const isElManifest =
    audio?.strategy === 'el-manifest' &&
    Boolean(audio.manifestUrl && audio.audioVersion && audio.catalogBaseUrl);
  const translationId = translation?.id;
  const manifestUrl = isElManifest ? audio?.manifestUrl : undefined;
  const audioVersion = isElManifest ? audio?.audioVersion : undefined;
  const catalogBaseUrl = isElManifest ? audio?.catalogBaseUrl : undefined;
  const key =
    translationId && manifestUrl && audioVersion && catalogBaseUrl
      ? `${translationId}:${audioVersion}:${manifestUrl}`
      : null;
  const [resolved, setResolved] = useState<ResolvedChapterMap | null>(null);

  useEffect(() => {
    if (!key || !translationId || !manifestUrl || !audioVersion || !catalogBaseUrl) {
      return;
    }

    let cancelled = false;

    // Lazy import keeps the jose/JWKS graph off this screen's static import path
    // (see services/elMedia/index.ts); the service never throws, but stay defensive.
    void import('../services/elMedia/elManifestService')
      .then(({ getElManifestForAudioCatalog }) =>
        getElManifestForAudioCatalog({ translationId, manifestUrl, audioVersion, catalogBaseUrl })
      )
      .then((manifest) => {
        if (!cancelled && manifest) {
          setResolved({ key, chapters: buildAudioChapterMapFromElManifest(manifest) });
        }
      })
      .catch(() => {
        // An unresolved manifest leaves every book tappable rather than greyed.
      });

    return () => {
      cancelled = true;
    };
  }, [key, translationId, manifestUrl, audioVersion, catalogBaseUrl]);

  return useMemo(() => {
    if (!translation) {
      return undefined;
    }

    if (key && resolved?.key === key) {
      return { ...translation, audioChapters: resolved.chapters };
    }

    return translation;
  }, [translation, key, resolved]);
}
