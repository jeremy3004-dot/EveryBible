/**
 * Persisted format for the `bible-storage` translation list.
 *
 * WHY THIS EXISTS
 * The store holds 200+ runtime (catalog) translations alongside the bundled ones. Persisting
 * them in full meant every single `set()` — chapter navigation, a download progress tick —
 * re-serialized every static field (name, description, copyright, the whole TranslationCatalog
 * with its audio/text manifests) and wrote the result to MMKV synchronously, and every cold boot
 * re-validated all of it with hundreds of regex evaluations before the reader could paint.
 *
 * The split:
 *   - `bible-storage`.translations  → per-translation DELTA only (what the user changed:
 *     download/install state and local pack paths). Cheap to serialize on the hot path.
 *   - `bible-runtime-catalog-v1`    → static catalog metadata for runtime translations, written
 *     only when a catalog refresh actually changes it, read once during hydration.
 *
 * OFFLINE GUARANTEE
 * The delta alone proves whether a Bible is on disk (`textPackLocalPath`, `downloadedAudioBooks`),
 * so a downloaded translation is restored even if the snapshot key is missing or corrupt — it
 * just gets placeholder metadata until the next successful catalog refresh repairs it. Nothing
 * the user downloaded over metered data can be lost by a metadata cache failure.
 */
import type { BibleTranslation } from '../types';
import {
  isRuntimeCatalogSnapshotEntry,
  sanitizeLegacyPersistedRuntimeTranslations,
  sanitizeRuntimeCatalogSnapshotEntries,
  type RuntimeCatalogSnapshotEntry,
} from './persistedStateSanitizers';

/**
 * Persisted-state version for `bible-storage`. Version 0 is the pre-split format that inlined
 * full runtime translation objects (Zustand's own default, which is what existing installs
 * carry); version 1 is delta + catalog snapshot.
 */
export const BIBLE_PERSISTED_STATE_VERSION = 1;

export const RUNTIME_CATALOG_SNAPSHOT_KEY = 'bible-runtime-catalog-v1';

/**
 * The user-mutable half of a translation — the only part the store itself ever changes, and so
 * the only part that has to survive inside the hot-path persisted blob. Everything else is
 * re-seeded from `bibleTranslations` (bundled) or the runtime catalog snapshot (runtime).
 */
export type PersistedTranslationDelta = Pick<
  BibleTranslation,
  | 'id'
  // `source` is what lets hydration tell a runtime delta (rejoin with the snapshot) from a
  // bundled one (rejoin with the live constants).
  | 'source'
  | 'isDownloaded'
  | 'downloadedBooks'
  | 'downloadedAudioBooks'
  | 'installState'
  | 'activeTextPackVersion'
  | 'pendingTextPackVersion'
  | 'pendingTextPackLocalPath'
  | 'textPackLocalPath'
  | 'rollbackTextPackVersion'
  | 'rollbackTextPackLocalPath'
  | 'lastInstallError'
  | 'activeDownloadJob'
>;

export interface RuntimeCatalogSnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PERSISTED_DELTA_KEYS: readonly (keyof PersistedTranslationDelta)[] = [
  'id',
  'source',
  'isDownloaded',
  'downloadedBooks',
  'downloadedAudioBooks',
  'installState',
  'activeTextPackVersion',
  'pendingTextPackVersion',
  'pendingTextPackLocalPath',
  'textPackLocalPath',
  'rollbackTextPackVersion',
  'rollbackTextPackLocalPath',
  'lastInstallError',
  'activeDownloadJob',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Resolved lazily (and cached) so this module has no import-time side effects and stays loadable
// under the Node test runner, which has no react-native-mmkv native binding.
let cachedDefaultStorage: RuntimeCatalogSnapshotStorage | null = null;

function resolveStorage(
  storage?: RuntimeCatalogSnapshotStorage
): RuntimeCatalogSnapshotStorage | null {
  if (storage) {
    return storage;
  }

  if (cachedDefaultStorage) {
    return cachedDefaultStorage;
  }

  try {
    const { mmkvInstance } = require('./mmkvStorage') as typeof import('./mmkvStorage');
    cachedDefaultStorage = {
      getItem: (key) => mmkvInstance.getString(key) ?? null,
      setItem: (key, value) => mmkvInstance.set(key, value),
    };
    return cachedDefaultStorage;
  } catch {
    return null;
  }
}

/**
 * Hot path: runs for every translation on every `set()`. Plain object literal, no regex, no URL
 * work, no branching — just field reads.
 *
 * The `?? undefined` on the pack-tracking fields is not cosmetic: JSON.stringify omits undefined
 * values, and for the 200+ catalog rows a user has NOT downloaded these are all null, so this
 * keeps ~200 bytes of `"pendingTextPackLocalPath":null` noise per row out of every write. Only
 * fields whose absent-value restores identically on both hydration paths (they all funnel through
 * sanitizeOptionalString / sanitizeTranslationDownloadJob, which return null for a missing key)
 * are elided this way. `isDownloaded`, the book arrays and `installState` are always written:
 * their absent-value falls back to the bundled defaults, not to empty.
 */
export function toPersistedTranslation(translation: BibleTranslation): PersistedTranslationDelta {
  return {
    id: translation.id,
    source: translation.source,
    isDownloaded: translation.isDownloaded,
    downloadedBooks: translation.downloadedBooks,
    downloadedAudioBooks: translation.downloadedAudioBooks,
    installState: translation.installState,
    activeTextPackVersion: translation.activeTextPackVersion ?? undefined,
    pendingTextPackVersion: translation.pendingTextPackVersion ?? undefined,
    pendingTextPackLocalPath: translation.pendingTextPackLocalPath ?? undefined,
    textPackLocalPath: translation.textPackLocalPath ?? undefined,
    rollbackTextPackVersion: translation.rollbackTextPackVersion ?? undefined,
    rollbackTextPackLocalPath: translation.rollbackTextPackLocalPath ?? undefined,
    lastInstallError: translation.lastInstallError ?? undefined,
    activeDownloadJob: translation.activeDownloadJob ?? undefined,
  };
}

export function buildRuntimeCatalogSnapshot(
  translations: readonly BibleTranslation[]
): RuntimeCatalogSnapshotEntry[] {
  const runtimeTranslations: BibleTranslation[] = [];

  for (const translation of translations) {
    if (translation.source === 'runtime') {
      runtimeTranslations.push(translation);
    }
  }

  return sanitizeRuntimeCatalogSnapshotEntries(runtimeTranslations);
}

type SnapshotWriteResult = 'written' | 'unchanged' | 'failed';

function persistSnapshotEntries(
  entries: RuntimeCatalogSnapshotEntry[],
  storage?: RuntimeCatalogSnapshotStorage
): SnapshotWriteResult {
  const target = resolveStorage(storage);

  if (!target) {
    return 'failed';
  }

  try {
    const serialized = JSON.stringify(entries);
    const stored = target.getItem(RUNTIME_CATALOG_SNAPSHOT_KEY);

    if (stored === serialized) {
      return 'unchanged';
    }

    // Never let an empty apply erase cached metadata. A refresh that produced no runtime rows is
    // not authoritative (refreshRuntimeCatalog bails out before applying an empty catalog), and
    // clearing the cache would demote every downloaded translation to placeholder metadata until
    // the network came back. Entries for retired translations are inert — hydration only joins
    // them against deltas that still exist in bible-storage.
    if (entries.length === 0 && stored && stored !== '[]') {
      return 'unchanged';
    }

    target.setItem(RUNTIME_CATALOG_SNAPSHOT_KEY, serialized);
    return 'written';
  } catch {
    return 'failed';
  }
}

/**
 * Refresh the cached catalog metadata. Called from the catalog-apply path only (never from a
 * download tick), and compares before writing so an unchanged catalog costs one MMKV read.
 * Returns true only when storage actually changed.
 */
export function writeRuntimeCatalogSnapshot(
  translations: readonly BibleTranslation[],
  storage?: RuntimeCatalogSnapshotStorage
): boolean {
  return persistSnapshotEntries(buildRuntimeCatalogSnapshot(translations), storage) === 'written';
}

/**
 * Read the cached catalog metadata as a lookup map. One pass, one cheap shape check per entry —
 * the deep validation already happened on the write path.
 */
export function readRuntimeCatalogSnapshot(
  storage?: RuntimeCatalogSnapshotStorage
): ReadonlyMap<string, RuntimeCatalogSnapshotEntry> {
  const snapshotById = new Map<string, RuntimeCatalogSnapshotEntry>();
  const target = resolveStorage(storage);

  if (!target) {
    return snapshotById;
  }

  try {
    const raw = target.getItem(RUNTIME_CATALOG_SNAPSHOT_KEY);
    if (!raw) {
      return snapshotById;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return snapshotById;
    }

    for (const entry of parsed) {
      if (isRuntimeCatalogSnapshotEntry(entry)) {
        snapshotById.set(entry.id, entry);
      }
    }
  } catch {
    // A corrupt snapshot degrades to "no cached metadata": downloaded translations still restore
    // from their deltas, and the next catalog refresh rewrites the key.
    return new Map();
  }

  return snapshotById;
}

function pickPersistedDelta(entry: unknown): unknown {
  if (!isRecord(entry)) {
    return entry;
  }

  const delta: Record<string, unknown> = {};
  for (const key of PERSISTED_DELTA_KEYS) {
    if (key in entry) {
      delta[key] = entry[key];
    }
  }

  return delta;
}

/**
 * Version 0 → 1: split each persisted runtime translation into a delta (stays in the store blob)
 * and its static metadata (moves to the runtime catalog snapshot key), so an upgrading install
 * keeps every downloaded Bible with its name, language and catalog intact.
 *
 * If the snapshot cannot be written, the legacy state is returned untouched rather than slimmed —
 * stripping metadata that has nowhere else to live would degrade downloaded translations to
 * placeholders. The hydration path accepts both shapes, and the next catalog refresh re-slims.
 */
export function migrateBiblePersistedState(
  persistedState: unknown,
  version: number | undefined,
  storage?: RuntimeCatalogSnapshotStorage
): unknown {
  if (typeof version === 'number' && version >= BIBLE_PERSISTED_STATE_VERSION) {
    return persistedState;
  }

  if (!isRecord(persistedState) || !Array.isArray(persistedState.translations)) {
    return persistedState;
  }

  // Hydrate the inline rows the way a boot on the old format would have, then snapshot the static
  // half of the result. Going through the full sanitizer keeps every legacy fixup (notably the
  // blank-timestamp Every Language catalogs) applied before the metadata is cached.
  const legacyRuntimeTranslations = sanitizeLegacyPersistedRuntimeTranslations(
    persistedState.translations
  );

  if (
    legacyRuntimeTranslations.length > 0 &&
    persistSnapshotEntries(
      sanitizeRuntimeCatalogSnapshotEntries(legacyRuntimeTranslations),
      storage
    ) === 'failed'
  ) {
    return persistedState;
  }

  return {
    ...persistedState,
    translations: persistedState.translations.map(pickPersistedDelta),
  };
}
