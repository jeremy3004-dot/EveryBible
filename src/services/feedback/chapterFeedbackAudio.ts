import * as FileSystem from 'expo-file-system/legacy';
import { isSupabaseConfigured } from '../supabase';

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
  path: string | null;
  durationMs: number;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
  base64Data?: string;
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

const readFileAsBase64 = async (uri: string): Promise<string> => {
  return FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as const,
  });
};

const assertValidBase64AudioSize = (
  base64Data: string,
  expectedSizeBytes: number | null
): boolean => {
  if (!expectedSizeBytes) {
    return true;
  }

  const paddingBytes = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  const decodedSizeBytes = Math.floor((base64Data.length * 3) / 4) - paddingBytes;
  return decodedSizeBytes === expectedSizeBytes;
};

export async function uploadChapterFeedbackAudio(
  draft: ChapterFeedbackAudioDraft,
  _context: ChapterFeedbackAudioUploadContext
): Promise<ChapterFeedbackAudioUploadResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
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

    const sizeBytes =
      'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : null;
    if (sizeBytes && sizeBytes > CHAPTER_FEEDBACK_AUDIO_MAX_SIZE_BYTES) {
      return { success: false, error: 'Audio responses must be 5 MB or smaller.' };
    }

    const base64Data = await readFileAsBase64(draft.uri);

    if (!assertValidBase64AudioSize(base64Data, sizeBytes)) {
      return { success: false, error: 'The recorded audio file could not be read.' };
    }

    return {
      success: true,
      data: {
        bucket: CHAPTER_FEEDBACK_AUDIO_BUCKET,
        path: null,
        durationMs,
        mimeType: CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
        sizeBytes,
        createdAt: new Date().toISOString(),
        base64Data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to upload audio response.',
    };
  }
}
