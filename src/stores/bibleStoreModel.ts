import type { BibleTranslation } from '../types';

function shouldPreserveBundledTranslation(
  existing: BibleTranslation | undefined
): existing is BibleTranslation {
  if (!existing || existing.source === 'runtime') {
    return false;
  }

  return existing.hasText || existing.isDownloaded;
}

export function mergeRuntimeCatalogTranslations(
  stateTranslations: BibleTranslation[],
  runtimeTranslations: BibleTranslation[]
): BibleTranslation[] {
  const mergedById = new Map<string, BibleTranslation>();

  for (const translation of stateTranslations) {
    if (translation.source !== 'runtime') {
      mergedById.set(translation.id, translation);
    }
  }

  for (const runtimeTranslation of runtimeTranslations) {
    if (runtimeTranslation.source !== 'runtime') {
      mergedById.set(runtimeTranslation.id, runtimeTranslation);
      continue;
    }

    const existing = mergedById.get(runtimeTranslation.id);

    if (shouldPreserveBundledTranslation(existing)) {
      mergedById.set(runtimeTranslation.id, {
        ...existing,
        hasAudio: existing.hasAudio || runtimeTranslation.hasAudio,
        catalog: runtimeTranslation.catalog ?? existing.catalog,
        activeTextPackVersion:
          existing.activeTextPackVersion ?? runtimeTranslation.activeTextPackVersion,
      });
      continue;
    }

    mergedById.set(runtimeTranslation.id, runtimeTranslation);
  }

  return Array.from(mergedById.values());
}
