export interface ParsedTextPackObjectKey {
  fileName: string;
  translationId: string;
}

export interface BuildTextPackManifestItemInput {
  abbreviation: string;
  fileName: string;
  lastModified: string;
  name: string;
  objectKey: string;
  sha256: string;
  sourceTranslationId: string;
  translationId: string;
  verseCount: number;
}

export interface TextPackManifestItem {
  abbreviation: string;
  downloadUrl: string;
  name: string;
  sha256: string;
  sourceTranslationId: string;
  translationId: string;
  updatedAt: string;
  verseCount: number;
  version: string;
}

export function parseTextPackObjectKey(objectKey: string): ParsedTextPackObjectKey | null {
  const match = objectKey.match(/^text\/([^/]+)\/([^/]+\.db)$/i);

  if (!match) {
    return null;
  }

  const translationId = match[1]?.trim();
  const fileName = match[2]?.trim();

  if (!translationId || !fileName) {
    return null;
  }

  return {
    translationId,
    fileName,
  };
}

export function buildTextPackManifestItem(
  input: BuildTextPackManifestItemInput
): TextPackManifestItem {
  const prefix = `${input.translationId}-`;
  const version = input.fileName.startsWith(prefix)
    ? input.fileName.slice(prefix.length, -'.db'.length)
    : input.fileName.replace(/\.db$/i, '');

  return {
    abbreviation: input.abbreviation,
    downloadUrl: input.objectKey,
    name: input.name,
    sha256: input.sha256,
    sourceTranslationId: input.sourceTranslationId,
    translationId: input.translationId,
    updatedAt: input.lastModified,
    verseCount: input.verseCount,
    version,
  };
}
