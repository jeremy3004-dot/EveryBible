import {
  buildAudioChapterMapFromElManifest,
  type AudioChapterMap,
} from '../bible/contentAvailability';
import type { BibleTranslation } from '../../types';

type CoverageTranslation = Pick<BibleTranslation, 'id' | 'catalog'>;

interface ElManifestRef {
  translationId: string;
  manifestUrl: string;
  audioVersion: string;
  catalogBaseUrl: string;
}

function getElManifestRef(translation: CoverageTranslation | undefined): ElManifestRef | null {
  const audio = translation?.catalog?.audio;
  if (
    !translation ||
    audio?.strategy !== 'el-manifest' ||
    !audio.manifestUrl ||
    !audio.audioVersion ||
    !audio.catalogBaseUrl
  ) {
    return null;
  }

  return {
    translationId: translation.id,
    manifestUrl: audio.manifestUrl,
    audioVersion: audio.audioVersion,
    catalogBaseUrl: audio.catalogBaseUrl,
  };
}

const coverageKey = (ref: ElManifestRef) =>
  JSON.stringify([ref.translationId, ref.audioVersion, ref.manifestUrl, ref.catalogBaseUrl]);

// Keyed by the manifest identity, so a new audio version is never answered from an
// older version's coverage. Manifests are immutable per version, so entries never go stale.
const resolvedCoverage = new Map<string, AudioChapterMap>();

/**
 * The exact per-chapter audio coverage already resolved for a translation, without
 * waiting. For synchronous callers (lock-screen skip buttons); `undefined` means
 * "not known yet" or "not a sparse set", and callers stay on plain adjacency.
 */
export function peekAudioChapterMap(
  translation: CoverageTranslation | undefined
): AudioChapterMap | undefined {
  const ref = getElManifestRef(translation);
  return ref ? resolvedCoverage.get(coverageKey(ref)) : undefined;
}

/**
 * The exact per-chapter audio coverage of a translation, resolved when it is asked
 * for rather than when a screen last rendered.
 *
 * Playback picks the next chapter from native callbacks that fire long after the
 * reader closed, possibly for a queue entry in another translation. Reading coverage
 * here, per translation and at that moment, keeps a sparse Every Language set from
 * advancing into a chapter it has no audio for. The manifest service caches memory →
 * disk → network, so a warm call does no I/O. `undefined` means the translation has
 * no manifest-described audio or the manifest could not be resolved; callers then keep
 * the optimistic canonical 1..N walk, as the Bible browser does.
 */
export async function resolveAudioChapterMap(
  translation: CoverageTranslation | undefined
): Promise<AudioChapterMap | undefined> {
  const ref = getElManifestRef(translation);
  if (!ref) {
    return undefined;
  }

  const key = coverageKey(ref);
  const cached = resolvedCoverage.get(key);
  if (cached) {
    return cached;
  }

  try {
    // Lazy: keeps the jose/JWKS verification graph off the audio hook's import path.
    const { getElManifestForAudioCatalog } = await import('../elMedia/elManifestService');
    const manifest = await getElManifestForAudioCatalog(ref);
    if (!manifest) {
      return undefined;
    }

    const coverage = buildAudioChapterMapFromElManifest(manifest);
    resolvedCoverage.set(key, coverage);
    return coverage;
  } catch {
    // The manifest service does not throw, but playback must never fail on coverage.
    return undefined;
  }
}

/** Test-only: forgets every resolved coverage map. */
export function __resetAudioChapterCoverageForTests(): void {
  resolvedCoverage.clear();
}
