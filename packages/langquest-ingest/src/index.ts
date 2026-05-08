import { createHash } from 'node:crypto';

export type AudioKeyKind = 'cloud' | 'local';

export interface AudioKeyClassification {
  kind: AudioKeyKind;
  key: string;
  reason: string;
}

export interface VerseRange {
  bookId?: string;
  chapter?: number;
  startVerse: number;
  endVerse: number;
}

export interface CompleteVerseRange extends VerseRange {
  bookId: string;
  chapter: number;
}

export type ParseVerseRangeResult = { ok: true; range: VerseRange } | { ok: false; error: string };

export interface LangQuestSegmentInput {
  id: string;
  sourceKey: string;
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  assetOrderIndex?: number | null;
  assetCreatedAt?: string | null;
  contentLinkOrderIndex?: number | null;
  contentLinkCreatedAt?: string | null;
  startMs?: number | null;
  endMs?: number | null;
  byteLength?: number | null;
  checksum?: string | null;
  mimeType?: string | null;
}

export interface LangQuestSegmentManifestRow extends CompleteVerseRange {
  id: string;
  sourceKey: string;
  r2Key: string;
  byteLength: number | null;
  checksum: string | null;
  mimeType: string;
  startMs: number | null;
  endMs: number | null;
}

export interface LangQuestManifestBookChapter {
  chapter: number;
  segments: LangQuestSegmentManifestRow[];
  totalBytes: number;
  totalSegments: number;
}

export interface LangQuestManifestBook {
  chapters: LangQuestManifestBookChapter[];
  totalBytes: number;
  totalChapters: number;
  totalSegments: number;
}

export interface LangQuestManifestSummary {
  schemaVersion: 1;
  provider: 'langquest';
  translationId: string;
  audioVersion: string;
  updatedAt: string;
  baseUrl: string;
  fileExt: string;
  mimeType: string;
  totalBooks: number;
  totalBytes: number;
  totalSegments: number;
  books: Record<string, LangQuestManifestBook>;
}

export interface BuildR2KeyOptions extends CompleteVerseRange {
  translationId: string;
  audioVersion: string;
  extension?: string;
  prefix?: string;
}

export interface BuildLangQuestManifestOptions {
  translationId: string;
  audioVersion: string;
  updatedAt: string;
  segments: readonly LangQuestSegmentInput[];
  extension?: string;
  mimeType?: string;
  prefix?: string;
}

export interface EveryBibleAudioVersionManifest {
  translationId: string;
  audioVersion: string;
  updatedAt: string;
  deliveryMode: 'segment';
  storageProvider: 'cloudflare-r2';
  baseUrl: string;
  fileExt: string;
  mimeType: string;
  totalBooks: number;
  totalBytes: number;
  totalSegments: number;
  books: Record<string, LangQuestManifestBook>;
}

export interface LangQuestChapterArtifactSegment {
  byte_size?: number | null;
  content_type?: string | null;
  r2_key: string;
  seq?: number | null;
  sha256?: string | null;
  source_supabase_key?: string | null;
  verse_from: number;
  verse_to: number;
}

export interface LangQuestChapterArtifactManifest {
  segments?: LangQuestChapterArtifactSegment[];
}

export interface LangQuestPromotionArtifactInput {
  bookId: string;
  chapter: number;
  id: string;
  manifest: LangQuestChapterArtifactManifest;
}

export interface BuildEveryBibleAudioPromotionManifestOptions {
  audioVersion: string;
  baseUrl?: string;
  fileExt?: string;
  mimeType?: string;
  translationId: string;
  updatedAt: string;
  artifacts: readonly LangQuestPromotionArtifactInput[];
}

const canonicalBookIds = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
] as const;

const canonicalBookIndex = new Map<string, number>(
  canonicalBookIds.map((bookId, index) => [bookId, index])
);

const cloudSchemePattern = /^(?:https?|r2|s3|gs):\/\//i;
const localPathPattern = /^(?:local\/|file:\/\/|~\/|\.{1,2}\/|\/|[a-z]:[\\/])/i;
const validObjectKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._!/$'()*+,;=:@-]*$/;
const validIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const validExtensionPattern = /^[A-Za-z0-9]+$/;

export function classifyAudioKey(input: string): AudioKeyClassification {
  const key = input.trim();

  if (!key) {
    throw new Error('Audio key is empty.');
  }

  if (cloudSchemePattern.test(key)) {
    return { kind: 'cloud', key, reason: 'supported cloud URL scheme' };
  }

  if (localPathPattern.test(key) || key.includes('\\')) {
    return { kind: 'local', key, reason: 'filesystem path syntax' };
  }

  if (key.includes('..') || key.startsWith('./')) {
    return { kind: 'local', key, reason: 'relative filesystem path syntax' };
  }

  if (!validObjectKeyPattern.test(key)) {
    return { kind: 'local', key, reason: 'not a safe object key' };
  }

  return { kind: 'cloud', key, reason: 'safe object key' };
}

export function parseAssetVerseRange(metadata: unknown): ParseVerseRangeResult {
  if (!metadata || typeof metadata !== 'object') {
    return { ok: false, error: 'Metadata must be an object.' };
  }

  const record = metadata as Record<string, unknown>;
  const direct = parseDirectVerseRange(record);
  if (direct.ok) {
    return direct;
  }

  const reference = firstString(record.reference, record.ref, record.verseRange, record.range);
  if (reference) {
    return parseVerseReference(reference);
  }

  return direct;
}

export function parseVerseReference(reference: string): ParseVerseRangeResult {
  const normalized = reference.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
  const match =
    /^(?<bookId>[1-3]?[A-Za-z]{2,3})\s+(?<chapter>\d{1,3}):(?<startVerse>\d{1,3})(?:-(?<endVerse>\d{1,3}))?$/.exec(
      normalized
    );

  if (!match?.groups) {
    return { ok: false, error: `Unsupported verse reference: ${reference}` };
  }

  return validateVerseRange({
    bookId: match.groups.bookId.toUpperCase(),
    chapter: Number(match.groups.chapter),
    startVerse: Number(match.groups.startVerse),
    endVerse: Number(match.groups.endVerse ?? match.groups.startVerse),
  });
}

export function orderSegmentRows<T extends LangQuestSegmentInput>(rows: readonly T[]): T[] {
  const normalized = rows.map((row, index) => {
    const validation = validateVerseRange(row);
    if (!validation.ok) {
      throw new Error(`Invalid segment ${row.id}: ${validation.error}`);
    }

    return { row, index };
  });

  return normalized
    .sort((left, right) => compareSegments(left.row, right.row) || left.index - right.index)
    .map(({ row }) => row);
}

export function computeChecksum(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildLangQuestR2Key(options: BuildR2KeyOptions): string {
  assertSafeId(options.translationId, 'translationId');
  assertSafeId(options.audioVersion, 'audioVersion');

  const range = validateVerseRange(options);
  if (!range.ok) {
    throw new Error(range.error);
  }
  const { bookId, chapter, startVerse, endVerse } = requireCompleteVerseRange(range.range);

  const extension = options.extension ?? 'mp3';
  if (!validExtensionPattern.test(extension)) {
    throw new Error(`Invalid extension: ${extension}`);
  }

  const prefix = normalizeR2Prefix(options.prefix ?? 'audio/langquest');
  const versePart =
    startVerse === endVerse ? pad(startVerse) : `${pad(startVerse)}-${pad(endVerse)}`;

  return `${prefix}/${options.translationId}/${options.audioVersion}/segments/${bookId}/${pad(
    chapter
  )}/${versePart}.${extension.toLowerCase()}`;
}

export function buildLangQuestManifest(
  options: BuildLangQuestManifestOptions
): LangQuestManifestSummary {
  assertSafeId(options.translationId, 'translationId');
  assertSafeId(options.audioVersion, 'audioVersion');

  const extension = options.extension ?? 'mp3';
  const mimeType = options.mimeType ?? 'audio/mpeg';
  const prefix = normalizeR2Prefix(options.prefix ?? 'audio/langquest');
  const orderedSegments = orderSegmentRows(options.segments);
  const books = new Map<string, Map<number, LangQuestSegmentManifestRow[]>>();

  for (const segment of orderedSegments) {
    const range = validateVerseRange(segment);
    if (!range.ok) {
      throw new Error(`Invalid segment ${segment.id}: ${range.error}`);
    }
    const completeRange = requireCompleteVerseRange(range.range);

    const row: LangQuestSegmentManifestRow = {
      id: segment.id,
      sourceKey: segment.sourceKey,
      bookId: completeRange.bookId,
      chapter: completeRange.chapter,
      startVerse: completeRange.startVerse,
      endVerse: completeRange.endVerse,
      startMs: segment.startMs ?? null,
      endMs: segment.endMs ?? null,
      byteLength: segment.byteLength ?? null,
      checksum: segment.checksum ?? null,
      mimeType: segment.mimeType ?? mimeType,
      r2Key: buildLangQuestR2Key({
        translationId: options.translationId,
        audioVersion: options.audioVersion,
        bookId: completeRange.bookId,
        chapter: completeRange.chapter,
        startVerse: completeRange.startVerse,
        endVerse: completeRange.endVerse,
        extension,
        prefix,
      }),
    };

    const chapterMap = books.get(row.bookId) ?? new Map<number, LangQuestSegmentManifestRow[]>();
    const segments = chapterMap.get(row.chapter) ?? [];
    segments.push(row);
    chapterMap.set(row.chapter, segments);
    books.set(row.bookId, chapterMap);
  }

  const manifestBooks: Record<string, LangQuestManifestBook> = {};
  let totalBytes = 0;

  for (const [bookId, chapters] of [...books.entries()].sort(([left], [right]) =>
    compareBookIds(left, right)
  )) {
    const manifestChapters: LangQuestManifestBookChapter[] = [...chapters.entries()]
      .sort(([left], [right]) => left - right)
      .map(([chapter, segments]) => {
        const chapterBytes = sumBytes(segments);
        totalBytes += chapterBytes;

        return {
          chapter,
          segments,
          totalBytes: chapterBytes,
          totalSegments: segments.length,
        };
      });

    manifestBooks[bookId] = {
      chapters: manifestChapters,
      totalBytes: manifestChapters.reduce((sum, chapter) => sum + chapter.totalBytes, 0),
      totalChapters: manifestChapters.length,
      totalSegments: manifestChapters.reduce((sum, chapter) => sum + chapter.totalSegments, 0),
    };
  }

  return {
    schemaVersion: 1,
    provider: 'langquest',
    translationId: options.translationId,
    audioVersion: options.audioVersion,
    updatedAt: options.updatedAt,
    baseUrl: `${prefix}/${options.translationId}/${options.audioVersion}`,
    fileExt: extension.toLowerCase(),
    mimeType,
    totalBooks: Object.keys(manifestBooks).length,
    totalBytes,
    totalSegments: orderedSegments.length,
    books: manifestBooks,
  };
}

export function adaptLangQuestManifestToEveryBibleAudioVersion(
  manifest: LangQuestManifestSummary
): EveryBibleAudioVersionManifest {
  return {
    translationId: manifest.translationId,
    audioVersion: manifest.audioVersion,
    updatedAt: manifest.updatedAt,
    deliveryMode: 'segment',
    storageProvider: 'cloudflare-r2',
    baseUrl: manifest.baseUrl,
    fileExt: manifest.fileExt,
    mimeType: manifest.mimeType,
    totalBooks: manifest.totalBooks,
    totalBytes: manifest.totalBytes,
    totalSegments: manifest.totalSegments,
    books: manifest.books,
  };
}

export function buildEveryBibleAudioPromotionManifest(
  options: BuildEveryBibleAudioPromotionManifestOptions
): EveryBibleAudioVersionManifest {
  assertSafeId(options.translationId, 'translationId');
  assertSafeId(options.audioVersion, 'audioVersion');

  const mimeType = options.mimeType ?? 'audio/mpeg';
  const fileExt = (options.fileExt ?? 'mp3').toLowerCase();
  if (!validExtensionPattern.test(fileExt)) {
    throw new Error(`Invalid fileExt: ${fileExt}`);
  }

  const segmentRows: LangQuestSegmentManifestRow[] = [];

  for (const artifact of options.artifacts) {
    const bookId = artifact.bookId.trim().toUpperCase();
    const segments = artifact.manifest.segments ?? [];

    if (segments.length === 0) {
      throw new Error(`Artifact ${artifact.id} has no manifest segments.`);
    }

    for (const segment of segments) {
      const range = validateVerseRange({
        bookId,
        chapter: artifact.chapter,
        startVerse: segment.verse_from,
        endVerse: segment.verse_to,
      });

      if (!range.ok) {
        throw new Error(`Invalid artifact ${artifact.id} segment: ${range.error}`);
      }

      const completeRange = requireCompleteVerseRange(range.range);
      segmentRows.push({
        id: `${artifact.id}:${segment.seq ?? segmentRows.length + 1}`,
        sourceKey: segment.source_supabase_key ?? segment.r2_key,
        r2Key: segment.r2_key,
        bookId: completeRange.bookId,
        chapter: completeRange.chapter,
        startVerse: completeRange.startVerse,
        endVerse: completeRange.endVerse,
        byteLength: segment.byte_size ?? null,
        checksum: segment.sha256 ?? null,
        mimeType: segment.content_type ?? mimeType,
        startMs: null,
        endMs: null,
      });
    }
  }

  const books = new Map<string, Map<number, LangQuestSegmentManifestRow[]>>();
  const orderedSegments = orderSegmentRows(segmentRows);

  for (const segment of orderedSegments) {
    const chapterMap =
      books.get(segment.bookId) ?? new Map<number, LangQuestSegmentManifestRow[]>();
    const chapterSegments = chapterMap.get(segment.chapter) ?? [];
    chapterSegments.push(segment);
    chapterMap.set(segment.chapter, chapterSegments);
    books.set(segment.bookId, chapterMap);
  }

  const manifestBooks: Record<string, LangQuestManifestBook> = {};
  let totalBytes = 0;

  for (const [bookId, chapters] of [...books.entries()].sort(([left], [right]) =>
    compareBookIds(left, right)
  )) {
    const manifestChapters: LangQuestManifestBookChapter[] = [...chapters.entries()]
      .sort(([left], [right]) => left - right)
      .map(([chapter, segments]) => {
        const chapterBytes = sumBytes(segments);
        totalBytes += chapterBytes;

        return {
          chapter,
          segments,
          totalBytes: chapterBytes,
          totalSegments: segments.length,
        };
      });

    manifestBooks[bookId] = {
      chapters: manifestChapters,
      totalBytes: manifestChapters.reduce((sum, chapter) => sum + chapter.totalBytes, 0),
      totalChapters: manifestChapters.length,
      totalSegments: manifestChapters.reduce((sum, chapter) => sum + chapter.totalSegments, 0),
    };
  }

  return {
    translationId: options.translationId,
    audioVersion: options.audioVersion,
    updatedAt: options.updatedAt,
    deliveryMode: 'segment',
    storageProvider: 'cloudflare-r2',
    baseUrl:
      options.baseUrl ?? `manifests/audio/${options.translationId}/${options.audioVersion}.json`,
    fileExt,
    mimeType,
    totalBooks: Object.keys(manifestBooks).length,
    totalBytes,
    totalSegments: orderedSegments.length,
    books: manifestBooks,
  };
}

function parseDirectVerseRange(record: Record<string, unknown>): ParseVerseRangeResult {
  const verse = record.verse;
  if (verse && typeof verse === 'object') {
    const nested = verse as Record<string, unknown>;
    const nestedStartVerse = firstNumber(nested.from, nested.startVerse, nested.verseStart);
    const nestedEndVerse =
      firstNumber(nested.to, nested.endVerse, nested.verseEnd) ?? nestedStartVerse;

    if (nestedStartVerse !== null && nestedEndVerse !== null) {
      return validateVerseRange({
        bookId: firstString(record.bookId, record.book, record.book_id)?.toUpperCase(),
        chapter:
          firstNumber(record.chapter, record.chapterNumber, record.chapter_number) ?? undefined,
        startVerse: nestedStartVerse,
        endVerse: nestedEndVerse,
      });
    }
  }

  const bookId = firstString(record.bookId, record.book, record.book_id)?.toUpperCase();
  const chapter = firstNumber(record.chapter, record.chapterNumber, record.chapter_number);
  const startVerse = firstNumber(
    record.startVerse,
    record.verseStart,
    record.start_verse,
    record.verse
  );
  const endVerse = firstNumber(record.endVerse, record.verseEnd, record.end_verse) ?? startVerse;

  if (!bookId || chapter === null || startVerse === null || endVerse === null) {
    return { ok: false, error: 'Metadata is missing bookId, chapter, or verse fields.' };
  }

  return validateVerseRange({ bookId, chapter, startVerse, endVerse });
}

function validateVerseRange(range: VerseRange): ParseVerseRangeResult {
  const bookId = range.bookId?.trim().toUpperCase();
  if (bookId && !canonicalBookIndex.has(bookId)) {
    return { ok: false, error: `Unsupported bookId: ${range.bookId}` };
  }

  if (range.chapter !== undefined && !isPositiveInteger(range.chapter)) {
    return { ok: false, error: `Invalid chapter: ${range.chapter}` };
  }

  if (!isPositiveInteger(range.startVerse) || !isPositiveInteger(range.endVerse)) {
    return {
      ok: false,
      error: `Invalid verse range: ${range.startVerse}-${range.endVerse}`,
    };
  }

  if (range.startVerse > range.endVerse) {
    return {
      ok: false,
      error: `Verse range starts after it ends: ${range.startVerse}-${range.endVerse}`,
    };
  }

  return {
    ok: true,
    range: {
      bookId,
      chapter: range.chapter,
      startVerse: range.startVerse,
      endVerse: range.endVerse,
    },
  };
}

function compareSegments(left: LangQuestSegmentInput, right: LangQuestSegmentInput): number {
  return (
    nullableNumber(left.assetOrderIndex) - nullableNumber(right.assetOrderIndex) ||
    nullableTimestamp(left.assetCreatedAt) - nullableTimestamp(right.assetCreatedAt) ||
    nullableNumber(left.contentLinkOrderIndex) - nullableNumber(right.contentLinkOrderIndex) ||
    nullableTimestamp(left.contentLinkCreatedAt) - nullableTimestamp(right.contentLinkCreatedAt) ||
    compareBookIds(left.bookId, right.bookId) ||
    left.chapter - right.chapter ||
    left.startVerse - right.startVerse ||
    left.endVerse - right.endVerse ||
    left.id.localeCompare(right.id)
  );
}

function compareBookIds(left: string, right: string): number {
  const normalizedLeft = left.toUpperCase();
  const normalizedRight = right.toUpperCase();

  return (
    (canonicalBookIndex.get(normalizedLeft) ?? Number.MAX_SAFE_INTEGER) -
      (canonicalBookIndex.get(normalizedRight) ?? Number.MAX_SAFE_INTEGER) ||
    normalizedLeft.localeCompare(normalizedRight)
  );
}

function requireCompleteVerseRange(range: VerseRange): CompleteVerseRange {
  if (!range.bookId || range.chapter === undefined) {
    throw new Error('Verse range is missing bookId or chapter.');
  }

  return {
    bookId: range.bookId,
    chapter: range.chapter,
    startVerse: range.startVerse,
    endVerse: range.endVerse,
  };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function nullableNumber(value: number | null | undefined): number {
  return value ?? Number.MAX_SAFE_INTEGER;
}

function nullableTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function pad(value: number): string {
  return String(value).padStart(3, '0');
}

function normalizeR2Prefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..') || !validObjectKeyPattern.test(normalized)) {
    throw new Error(`Invalid R2 prefix: ${prefix}`);
  }

  return normalized;
}

function assertSafeId(value: string, field: string): void {
  if (!validIdPattern.test(value)) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
}

function sumBytes(segments: readonly LangQuestSegmentManifestRow[]): number {
  return segments.reduce((sum, segment) => sum + (segment.byteLength ?? 0), 0);
}
