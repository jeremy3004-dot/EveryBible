import { buildBibleDeepLink } from '../bible/deepLinkParser';
import type { PassageBlock } from './gatherBibleService';
import type { BibleReference } from '../../types/gather';
import type { LessonAudioSource } from './lessonAudioSource';

export interface LessonSharePayload {
  message: string;
  url?: string;
}

/**
 * "Share text": the lesson title, then each passage under its reference and the
 * translation it was actually read from (a block borrowed from the bundled BSB
 * is labelled BSB, not the reader's translation).
 */
export function buildLessonTextShareMessage({
  lessonTitle,
  referenceLabel,
  blocks,
  translationName,
}: {
  lessonTitle: string;
  referenceLabel: string;
  blocks: readonly PassageBlock[];
  translationName: (translationId: string) => string;
}): string {
  const passages = blocks
    .filter((block) => block.verses.length > 0)
    .map(
      (block) =>
        `${block.label} (${translationName(block.translationId)})\n` +
        block.verses.map((verse) => verse.text.trim()).join(' ')
    );

  if (passages.length === 0) {
    return `${lessonTitle}\n${referenceLabel}`;
  }
  return [lessonTitle, ...passages].join('\n\n');
}

/**
 * "Share link": the reader deep link for the lesson's first passage. Lessons
 * have no route of their own, so the passage is the most useful destination.
 */
export function buildLessonLinkShare({
  lessonTitle,
  referenceLabel,
  references,
}: {
  lessonTitle: string;
  referenceLabel: string;
  references: readonly BibleReference[];
}): { message: string; url: string | null } {
  const primary = references[0];
  const url = primary
    ? buildBibleDeepLink(primary.bookId, primary.chapter, primary.startVerse)
    : '';
  return { message: `${lessonTitle} · ${referenceLabel}`, url: url || null };
}

/**
 * React Native's Share only honours `url` on iOS; Android shares the message
 * alone, so the link rides inside it there (the reader's share does the same).
 */
export function toSharePayload(
  os: string,
  message: string,
  url: string | null
): LessonSharePayload {
  if (!url) {
    return { message };
  }
  return os === 'android' ? { message: `${message}\n${url}` } : { message, url };
}

export interface LessonAudioShareDeps {
  /** Copies (or reuses) the chapter recording as a local file the share sheet can attach. */
  prepareAsset: (source: LessonAudioSource) => Promise<{ uri: string; mimeType: string } | null>;
  /** Null when the native sharing module is unavailable (Expo Go, stale dev client). */
  shareFile: ((uri: string, mimeType: string) => Promise<void>) | null;
  shareMessage: (payload: LessonSharePayload) => Promise<void>;
  os: string;
}

// expo-sharing's native module can be missing (Expo Go, a stale dev client);
// then the recording's URL is shared instead of crashing.
async function loadAvailableSharing(): Promise<typeof import('expo-sharing') | null> {
  try {
    const mod = await import('expo-sharing');
    return typeof mod.isAvailableAsync === 'function' && (await mod.isAvailableAsync())
      ? mod
      : null;
  } catch {
    return null;
  }
}

/**
 * Production wiring for shareLessonAudio, loaded on demand like the reader's
 * chapter-audio share so none of these native modules load with the Gather tab.
 */
export async function loadLessonAudioShareDeps(
  os: string,
  shareMessage: (payload: LessonSharePayload) => Promise<void>,
  dialogTitle: string
): Promise<LessonAudioShareDeps> {
  const [downloadStorage, downloadService, remoteAudio, shareService, FileSystem] =
    await Promise.all([
      import('../audio/audioDownloadStorage'),
      import('../audio/audioDownloadService'),
      import('../audio/audioRemote'),
      import('../audio/audioShareService'),
      import('expo-file-system/legacy'),
    ]);

  const Sharing = await loadAvailableSharing();
  const fileSystem = downloadStorage.expoAudioFileSystemAdapter;
  return {
    os,
    shareMessage,
    prepareAsset: (source) =>
      shareService.prepareChapterAudioShareAsset({
        translationId: source.translationId,
        bookId: source.bookId,
        chapter: source.chapter,
        fileSystem,
        rootUri: `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? 'file:///'}everybible-audio-share/`,
        resolveDownloadedAudioUri: (translationId, bookId, chapter) =>
          downloadService.getDownloadedChapterAudioUri(
            translationId,
            bookId,
            chapter,
            fileSystem,
            downloadStorage.AUDIO_DOWNLOAD_ROOT_URI
          ),
        resolveRemoteAudio: remoteAudio.fetchRemoteChapterAudio,
      }),
    shareFile: Sharing
      ? (uri, mimeType) => Sharing.shareAsync(uri, { dialogTitle, mimeType, UTI: 'public.audio' })
      : null,
  };
}

const isRemoteUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * "Share audio": attach the chapter recording itself; when the file cannot be
 * prepared or shared, share the recording's web address instead. A downloaded
 * file's local path means nothing to the recipient, so it is left out.
 */
export async function shareLessonAudio(
  source: LessonAudioSource,
  message: string,
  deps: LessonAudioShareDeps
): Promise<'file' | 'link'> {
  if (deps.shareFile) {
    let asset: { uri: string; mimeType: string } | null = null;
    try {
      asset = await deps.prepareAsset(source);
    } catch {
      asset = null;
    }
    if (asset) {
      try {
        await deps.shareFile(asset.uri, asset.mimeType);
        return 'file';
      } catch {
        // The sheet refused the file (no app takes audio, a native error), not a
        // user cancel, which resolves. Fall through to sharing the link.
      }
    }
  }

  await deps.shareMessage(
    toSharePayload(deps.os, message, isRemoteUrl(source.url) ? source.url : null)
  );
  return 'link';
}
