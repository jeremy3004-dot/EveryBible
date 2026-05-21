import * as FileSystem from 'expo-file-system';
import { getCurrentUserId, isSupabaseConfigured, supabase } from '../supabase';

export const CHAPTER_FEEDBACK_AUDIO_BUCKET = 'chapter-feedback-audio';
export const CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS = 120000;
export const CHAPTER_FEEDBACK_AUDIO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const CHAPTER_FEEDBACK_AUDIO_MIME_TYPE = 'audio/mp4';
export const CHAPTER_FEEDBACK_AUDIO_EXTENSION = 'm4a';

export interface ChapterFeedbackAudioDraft {
  uri: string;
  durationMs: number;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface ChapterFeedbackAudioAttachment {
  bucket: typeof CHAPTER_FEEDBACK_AUDIO_BUCKET;
  path: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface ChapterFeedbackAudioUploadContext {
  translationId: string;
  bookId: string;
  chapter: number;
}

export interface ChapterFeedbackAudioUploadResult {
  success: boolean;
  data?: ChapterFeedbackAudioAttachment;
  error?: string;
}

const sanitizePathSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const readFileAsUint8Array = async (uri: string): Promise<Uint8Array> => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as const,
  });
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
};

const buildFeedbackAudioPath = (
  userId: string,
  context: ChapterFeedbackAudioUploadContext
): string => {
  const createdAt = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return [
    userId,
    sanitizePathSegment(context.translationId),
    sanitizePathSegment(context.bookId),
    String(context.chapter),
    `${createdAt}-${randomSuffix}.${CHAPTER_FEEDBACK_AUDIO_EXTENSION}`,
  ].join('/');
};

export async function uploadChapterFeedbackAudio(
  draft: ChapterFeedbackAudioDraft,
  context: ChapterFeedbackAudioUploadContext
): Promise<ChapterFeedbackAudioUploadResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Please sign in before sending an audio response.' };
  }

  const durationMs = Math.max(0, Math.round(draft.durationMs));
  if (durationMs < 500) {
    return { success: false, error: 'Please record at least a short audio response.' };
  }

  if (durationMs > CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS) {
    return { success: false, error: 'Audio responses must be 2 minutes or shorter.' };
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(draft.uri);
    if (!fileInfo.exists) {
      return { success: false, error: 'The recorded audio file could not be found.' };
    }

    const sizeBytes = 'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : null;
    if (sizeBytes && sizeBytes > CHAPTER_FEEDBACK_AUDIO_MAX_SIZE_BYTES) {
      return { success: false, error: 'Audio responses must be 5 MB or smaller.' };
    }

    const path = buildFeedbackAudioPath(userId, context);
    const audioBytes = await readFileAsUint8Array(draft.uri);
    const { error: uploadError } = await supabase.storage
      .from(CHAPTER_FEEDBACK_AUDIO_BUCKET)
      .upload(path, audioBytes, {
        contentType: CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    return {
      success: true,
      data: {
        bucket: CHAPTER_FEEDBACK_AUDIO_BUCKET,
        path,
        durationMs,
        mimeType: CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
        sizeBytes,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to upload audio response.',
    };
  }
}
