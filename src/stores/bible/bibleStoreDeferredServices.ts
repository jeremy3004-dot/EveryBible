/**
 * Services the Bible store reaches only on demand.
 *
 * bibleStore sits on the navigator's static import graph, so every module here is loaded with
 * `require()`/`import()` at the moment an action needs it rather than on every cold start.
 */
import type { BibleTranslation } from '../../types';

// The translations service barrel also evaluates the runtime catalog
// bootstrap and the locale search engine (Fuse). bibleStore sits on the
// navigator's static graph, and its only use of the service is this
// fire-and-forget preference save, so load the barrel on first use instead of
// on every cold start (the same pattern authStore uses for Supabase).
export function saveTranslationPreference(translationId: string, chosenAt: string): void {
  try {
    const { setUserTranslationPreferences } =
      require('../../services/translations') as typeof import('../../services/translations');
    setUserTranslationPreferences({ primary: translationId, chosenAt }).catch(() => {});
  } catch {
    // Preference sync is best-effort; a failed load must not undo the local switch.
  }
}

// bibleDatabase brings expo-sqlite and the SQLite schema code with it, and this
// store is on the path to Home. The store only needs the database when a text
// pack is installed, repaired or removed, so it is required then. The resolvers
// registered at the bottom of bibleStore.ts live in bibleDatabaseSources, which has
// no SQLite dependency, so they are still in place before the first read.
export function invalidateInstalledBibleDatabaseAtPath(localPath: string): Promise<void> {
  const bibleDatabase =
    require('../../services/bible/bibleDatabase') as typeof import('../../services/bible/bibleDatabase');
  return bibleDatabase.invalidateInstalledBibleDatabaseAtPath(localPath);
}

// Packs are published without a full-text index. Build it inside the pack in the background so
// word search works offline; until it finishes, search answers with a substring scan.
export function scheduleTextPackSearchIndexBuild(translationId: string): void {
  try {
    const bibleDatabase =
      require('../../services/bible/bibleDatabase') as typeof import('../../services/bible/bibleDatabase');
    void bibleDatabase.scheduleTextPackSearchIndexBuild(translationId);
  } catch (error) {
    console.warn('[Bible] Could not start the text pack search index build:', translationId, error);
  }
}

export type AudioDownloadModules = typeof import('../../services/audio/audioDownloadService') &
  typeof import('../../services/audio/audioDownloadStorage') &
  typeof import('../../services/audio/audioRemote');

export async function loadAudioDownloadModules(): Promise<AudioDownloadModules> {
  const [downloadService, downloadStorage, audioRemote] = await Promise.all([
    import('../../services/audio/audioDownloadService'),
    import('../../services/audio/audioDownloadStorage'),
    import('../../services/audio/audioRemote'),
  ]);

  return {
    ...downloadService,
    ...downloadStorage,
    ...audioRemote,
  };
}

export async function deleteFileSystemPath(localPath: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  await FileSystem.deleteAsync(localPath, { idempotent: true });
}

// A pack file can exist but be a 0-byte SQLite stub left behind when getDatabase's
// installed-source open path was interrupted or ran against a missing download; treat
// that as "missing" so reconcileTranslationPacks re-triggers a real download instead of
// permanently trusting an unusable database file.
export async function fileSystemPathIsUsableDatabase(localPath: string): Promise<boolean> {
  const FileSystem = await import('expo-file-system/legacy');
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  return fileInfo.exists && fileInfo.size > 0;
}

// Download-completion analytics route through the unified anonymous-usage
// pipeline (P1 S3) so they land for signed-out users and pick up server-side
// geo enrichment, rather than the authenticated-only path that 401'd + fell back
// to the geo-less RPC.
export function trackBibleStoreEvent(
  eventName: 'text_translation_download_completed' | 'audio_download_completed',
  properties: Record<string, unknown>
): void {
  void import('../../services/analytics/anonymousUsageAnalytics')
    .then(({ trackAnonymousUsageEvent }) => {
      trackAnonymousUsageEvent(eventName, properties);
    })
    .catch(() => {});
}

// Module-eval used to call syncRemoteAudioMetadataResolverWithTranslations synchronously, adding
// a full pass over the catalog to the startup JS thread. Deferred the same way verse-timestamp
// metadata already is. (P19)
export function syncRemoteAudioMetadataDeferred(translations: BibleTranslation[]): void {
  void import('../../services/audio/audioRemote')
    .then(({ syncRemoteAudioMetadataResolverWithTranslations }) => {
      syncRemoteAudioMetadataResolverWithTranslations(translations);
    })
    .catch(() => {
      // Audio metadata is a best-effort enrichment; a failure here must not block startup.
    });
}

export function syncVerseTimestampMetadata(translations: BibleTranslation[]): void {
  void import('../../services/bible/verseTimestamps')
    .then(({ syncVerseTimestampMetadataResolverWithTranslations }) => {
      syncVerseTimestampMetadataResolverWithTranslations(translations);
    })
    .catch(() => {});
}
