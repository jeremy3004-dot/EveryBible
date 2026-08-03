export interface ElManifestChapter {
  chapter: number;
  path: string; // resolves against manifest baseUrl
  bytes: number;
  sha256: string;
  durationMs?: number;
}

export interface ElAudioManifest {
  schema: string; // 'everybible-audio-manifest/v1'
  translationId: string;
  audioVersion: string;
  deliveryMode: 'chapter';
  baseUrl: string;
  fileExt: string;
  mimeType: string;
  books: Record<string, ElManifestChapter[]>; // key: 3-letter USFM
}

export interface ElResolvedChapter {
  url: string;
  mimeType: string;
  fileExt: string;
  bytes: number;
  durationMs?: number;
}

const EL_MANIFEST_SCHEMA_PREFIX = 'everybible-audio-manifest/v1';
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function parseElManifestChapter(raw: unknown): ElManifestChapter | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (!isPositiveInteger(entry.chapter)) return null;
  if (!isNonEmptyString(entry.path) || !entry.path.startsWith('/')) return null;
  if (!isPositiveInteger(entry.bytes)) return null;
  if (!isNonEmptyString(entry.sha256) || !SHA256_HEX_RE.test(entry.sha256)) return null;
  const parsed: ElManifestChapter = {
    chapter: entry.chapter,
    path: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
  };
  if (typeof entry.duration_ms === 'number') parsed.durationMs = entry.duration_ms;
  return parsed;
}

function parseElManifestBook(raw: unknown): ElManifestChapter[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const book = raw as Record<string, unknown>;
  if (!Array.isArray(book.chapters)) return null;
  const chapters: ElManifestChapter[] = [];
  for (const rawChapter of book.chapters) {
    const chapter = parseElManifestChapter(rawChapter);
    // One malformed chapter never drops the rest of the book.
    if (chapter) chapters.push(chapter);
  }
  // A book with no valid chapters carries no audio; drop it entirely.
  return chapters.length > 0 ? chapters : null;
}

export function parseElManifestPayload(payload: unknown): ElAudioManifest | null {
  if (!payload || typeof payload !== 'object') return null;
  const doc = payload as Record<string, unknown>;
  if (!isNonEmptyString(doc.schema) || !doc.schema.startsWith(EL_MANIFEST_SCHEMA_PREFIX)) {
    return null;
  }
  if (doc.delivery_mode !== 'chapter') return null;
  if (
    !isNonEmptyString(doc.translation_id) ||
    !isNonEmptyString(doc.audio_version) ||
    !isNonEmptyString(doc.base_url) ||
    !isNonEmptyString(doc.file_ext) ||
    !isNonEmptyString(doc.mime_type)
  ) {
    return null;
  }
  if (!doc.books || typeof doc.books !== 'object') return null;
  const books: Record<string, ElManifestChapter[]> = {};
  for (const [bookId, rawBook] of Object.entries(doc.books as Record<string, unknown>)) {
    const chapters = parseElManifestBook(rawBook);
    // One malformed book never drops the others.
    if (chapters) books[bookId] = chapters;
  }
  return {
    schema: doc.schema,
    translationId: doc.translation_id,
    audioVersion: doc.audio_version,
    deliveryMode: 'chapter',
    baseUrl: doc.base_url,
    fileExt: doc.file_ext,
    mimeType: doc.mime_type,
    books,
  };
}

export function resolveElChapterFromManifest(
  manifest: ElAudioManifest,
  bookId: string,
  chapter: number
): ElResolvedChapter | null {
  const chapters = manifest.books[bookId];
  if (!chapters) return null;
  const match = chapters.find((c) => c.chapter === chapter);
  if (!match) return null;
  // Literal paths only — no template expansion. Path is guaranteed to start with '/'.
  const base = manifest.baseUrl.replace(/\/+$/, '');
  const resolved: ElResolvedChapter = {
    url: `${base}${match.path}`,
    mimeType: manifest.mimeType,
    fileExt: manifest.fileExt,
    bytes: match.bytes,
  };
  if (match.durationMs !== undefined) resolved.durationMs = match.durationMs;
  return resolved;
}
