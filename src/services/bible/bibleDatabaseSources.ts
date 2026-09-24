import { chapterCache } from './chapterCache';

// The hooks bibleStore uses to tell the SQLite layer where an installed text
// pack lives and when a translation is ready to read. They live apart from
// bibleDatabase.ts so the store can register them at import time without
// loading expo-sqlite and the database code: the store is on the path to Home,
// the database is first read after it.

export type BibleDatabaseSource =
  | {
      kind: 'bundled';
      databaseName: string;
      assetId: number;
    }
  | {
      kind: 'installed';
      translationId: string;
      databaseName: string;
      directory: string;
      /** The catalog text version the pack was installed from; keys its search index. */
      packVersion?: string;
    };

export type BibleDatabaseSourceResolver = (translationId: string) => BibleDatabaseSource | null;
export type BibleTranslationReadinessResolver = (translationId: string) => Promise<void>;

let bibleDatabaseSourceResolver: BibleDatabaseSourceResolver = () => null;
let bibleTranslationReadinessResolver: BibleTranslationReadinessResolver | null = null;

export function setBibleDatabaseSourceResolver(resolver: BibleDatabaseSourceResolver | null): void {
  chapterCache.clear();
  bibleDatabaseSourceResolver = resolver ?? (() => null);
}

export function setBibleTranslationReadinessResolver(
  resolver: BibleTranslationReadinessResolver | null
): void {
  bibleTranslationReadinessResolver = resolver;
}

/** The installed database registered for a translation, or null for the bundled one. */
export function resolveRegisteredBibleDatabaseSource(
  translationId: string
): BibleDatabaseSource | null {
  return bibleDatabaseSourceResolver(translationId);
}

export async function ensureTranslationReady(translationId: string): Promise<void> {
  await bibleTranslationReadinessResolver?.(translationId);
}
