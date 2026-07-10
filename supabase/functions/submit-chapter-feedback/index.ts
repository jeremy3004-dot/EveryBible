import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Sentiment = 'up' | 'down';

interface ChapterFeedbackRequest {
  translationId?: string;
  translationLanguage?: string;
  bookId?: string;
  chapter?: number;
  sentiment?: Sentiment;
  comment?: string | null;
  interfaceLanguage?: string;
  contentLanguageCode?: string | null;
  contentLanguageName?: string | null;
  participantName?: string | null;
  participantRole?: string | null;
  audioResponse?: ChapterFeedbackAudioRequest | null;
  sourceScreen?: string;
  appPlatform?: string | null;
  appVersion?: string | null;
}

interface ChapterFeedbackAudioRequest {
  bucket?: string;
  path?: string | null;
  durationMs?: number;
  mimeType?: string;
  sizeBytes?: number | null;
  createdAt?: string;
  base64Data?: string;
}

interface ChapterFeedbackInsert {
  user_id: string | null;
  translation_id: string;
  translation_language: string;
  interface_language: string;
  content_language_code: string | null;
  content_language_name: string | null;
  participant_name: string | null;
  participant_role: string | null;
  participant_id_number: string | null;
  audio_response_bucket: string | null;
  audio_response_path: string | null;
  audio_response_mime_type: string | null;
  audio_response_size_bytes: number | null;
  audio_response_duration_ms: number | null;
  audio_response_created_at: string | null;
  book_id: string;
  chapter: number;
  sentiment: Sentiment;
  comment: string | null;
  source_screen: string;
  app_platform: string | null;
  app_version: string | null;
  export_status: 'pending' | 'exported' | 'failed';
}

interface ChapterFeedbackRow extends ChapterFeedbackInsert {
  id: string;
  created_at: string;
}

interface PendingAudioUpload {
  base64Data: string;
  path: string;
  mimeType: string;
  sizeBytes: number | null;
}

const AUDIO_RESPONSE_MAX_DURATION_MS = 60000;
const AUDIO_RESPONSE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AUDIO_RESPONSE_MAX_BASE64_LENGTH = Math.ceil((AUDIO_RESPONSE_MAX_SIZE_BYTES * 4) / 3) + 8;
const AUDIO_RESPONSE_MIME_TYPE = 'audio/mp4';

// Max submissions per user per rolling hour — spam/flood guard (S3, S8).
const SUBMISSION_RATE_LIMIT_PER_HOUR = 20;

// Canonical 66-book chapter counts. Guards against arbitrary book_id / out-of-range
// chapter values polluting the dataset (S6). Keep in sync with src/constants/books.ts.
const BOOK_CHAPTER_COUNTS: Record<string, number> = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4, '1SA': 31,
  '2SA': 24, '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36, EZR: 10, NEH: 13, EST: 10,
  JOB: 42, PSA: 150, PRO: 31, ECC: 12, SNG: 8, ISA: 66, JER: 52, LAM: 5, EZK: 48,
  DAN: 12, HOS: 14, JOL: 3, AMO: 9, OBA: 1, JON: 4, MIC: 7, NAM: 3, HAB: 3, ZEP: 3,
  HAG: 2, ZEC: 14, MAL: 4, MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16,
  '1CO': 16, '2CO': 13, GAL: 6, EPH: 6, PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6,
  '2TI': 4, TIT: 3, PHM: 1, HEB: 13, JAS: 5, '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1,
  '3JN': 1, JUD: 1, REV: 22,
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const trimOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const requireNonEmptyString = (value: unknown): string | null => {
  const trimmed = trimOptionalText(value);
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const sanitizePathSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const buildStoredAudioPath = (body: ChapterFeedbackRequest, userId: string | null): string => {
  const createdAt = Date.now();
  const randomSuffix = crypto.randomUUID();

  return [
    userId ?? 'anonymous',
    sanitizePathSegment(body.translationId ?? ''),
    sanitizePathSegment(body.bookId ?? ''),
    String(body.chapter ?? 'unknown'),
    `${createdAt}-${randomSuffix}.m4a`,
  ].join('/');
};

const base64DecodedSize = (base64Data: string): number | null => {
  if (
    base64Data.length > AUDIO_RESPONSE_MAX_BASE64_LENGTH ||
    /\s/.test(base64Data) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) ||
    base64Data.length % 4 !== 0
  ) {
    return null;
  }

  const paddingBytes = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  const decodedSize = Math.floor((base64Data.length * 3) / 4) - paddingBytes;
  return decodedSize > 0 ? decodedSize : null;
};

const decodeBase64 = (base64Data: string): Uint8Array => {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
};

const getRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
};

const validateRequest = (
  body: ChapterFeedbackRequest,
  userId: string | null
): { value?: ChapterFeedbackInsert; pendingAudioUpload?: PendingAudioUpload; error?: string } => {
  const translationId = requireNonEmptyString(body.translationId);
  const translationLanguage = requireNonEmptyString(body.translationLanguage);
  const bookId = requireNonEmptyString(body.bookId);
  const interfaceLanguage = requireNonEmptyString(body.interfaceLanguage);
  const comment = trimOptionalText(body.comment);
  const participantName = trimOptionalText(body.participantName);
  const participantRole = trimOptionalText(body.participantRole);

  if (!translationId || !translationLanguage || !bookId || !interfaceLanguage) {
    return {
      error:
        'translationId, translationLanguage, bookId, chapter, sentiment, and interfaceLanguage are required',
    };
  }

  const normalizedBookId = bookId.toUpperCase();
  const bookChapterCount = BOOK_CHAPTER_COUNTS[normalizedBookId];
  if (bookChapterCount === undefined) {
    return { error: 'bookId is not a recognized Bible book' };
  }

  if (!Number.isInteger(body.chapter) || (body.chapter ?? 0) < 1) {
    return { error: 'chapter must be an integer greater than or equal to 1' };
  }

  if ((body.chapter ?? 0) > bookChapterCount) {
    return { error: 'chapter is out of range for this book' };
  }

  if (body.sentiment !== 'up' && body.sentiment !== 'down') {
    return { error: "sentiment must be either 'up' or 'down'" };
  }

  if (comment && comment.length > 2000) {
    return { error: 'comment must be 2000 characters or fewer' };
  }

  const audioResponse = body.audioResponse ?? null;
  let pendingAudioUpload: PendingAudioUpload | undefined;
  let audioResponsePath: string | null = null;

  if (audioResponse) {
    if (audioResponse.bucket !== 'chapter-feedback-audio') {
      return { error: 'audio response bucket is not supported' };
    }

    const preuploadedAudioPath = requireNonEmptyString(audioResponse.path);
    const base64Data = requireNonEmptyString(audioResponse.base64Data);

    if (audioResponse.mimeType !== AUDIO_RESPONSE_MIME_TYPE) {
      return { error: 'audio response must use audio/mp4' };
    }

    if (
      !Number.isInteger(audioResponse.durationMs) ||
      (audioResponse.durationMs ?? 0) < 500 ||
      (audioResponse.durationMs ?? 0) > AUDIO_RESPONSE_MAX_DURATION_MS
    ) {
      return { error: 'audio response duration must be between 0.5 and 60 seconds' };
    }

    if (
      audioResponse.sizeBytes != null &&
      (!Number.isInteger(audioResponse.sizeBytes) ||
        audioResponse.sizeBytes < 1 ||
        audioResponse.sizeBytes > AUDIO_RESPONSE_MAX_SIZE_BYTES)
    ) {
      return { error: 'audio response size must be 5 MB or smaller' };
    }

    const createdAtTime = Date.parse(audioResponse.createdAt ?? '');
    if (!Number.isFinite(createdAtTime)) {
      return { error: 'audio response createdAt must be an ISO timestamp' };
    }

    if (base64Data) {
      const decodedSizeBytes = base64DecodedSize(base64Data);

      if (decodedSizeBytes == null || decodedSizeBytes > AUDIO_RESPONSE_MAX_SIZE_BYTES) {
        return { error: 'audio response size must be 5 MB or smaller' };
      }

      if (audioResponse.sizeBytes != null && decodedSizeBytes !== audioResponse.sizeBytes) {
        return { error: 'audio response size does not match upload data' };
      }

      audioResponsePath = buildStoredAudioPath(body, userId);
      pendingAudioUpload = {
        base64Data,
        path: audioResponsePath,
        mimeType: audioResponse.mimeType,
        sizeBytes: audioResponse.sizeBytes ?? null,
      };
    } else if (userId && preuploadedAudioPath) {
      if (!preuploadedAudioPath.startsWith(`${userId}/`)) {
        return { error: 'audio response path is invalid for this user' };
      }

      audioResponsePath = preuploadedAudioPath;
    } else {
      return { error: 'audio responses must include upload data' };
    }

    if (userId && !audioResponsePath.startsWith(`${userId}/`)) {
      return { error: 'audio response path is invalid for this user' };
    }
  }

  return {
    value: {
      user_id: null,
      translation_id: translationId,
      translation_language: translationLanguage,
      interface_language: interfaceLanguage,
      content_language_code: trimOptionalText(body.contentLanguageCode),
      content_language_name: trimOptionalText(body.contentLanguageName),
      participant_name: participantName,
      participant_role: participantRole,
      participant_id_number: null,
      audio_response_bucket: audioResponse ? 'chapter-feedback-audio' : null,
      audio_response_path: audioResponsePath,
      audio_response_mime_type: audioResponse?.mimeType ?? null,
      audio_response_size_bytes: audioResponse?.sizeBytes ?? null,
      audio_response_duration_ms: audioResponse?.durationMs ?? null,
      audio_response_created_at: audioResponse?.createdAt ?? null,
      book_id: normalizedBookId,
      chapter: body.chapter,
      sentiment: body.sentiment,
      comment,
      source_screen: requireNonEmptyString(body.sourceScreen) ?? 'reader',
      app_platform: trimOptionalText(body.appPlatform),
      app_version: trimOptionalText(body.appVersion),
      export_status: 'exported',
    },
    pendingAudioUpload,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = getRequiredSecret('SUPABASE_URL');
    const anonKey = getRequiredSecret('SUPABASE_ANON_KEY');
    const serviceRoleKey = getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Feedback is council-only: require a valid signed-in user (S1). No anonymous path.
    let userId: string | null = null;
    if (authorization?.startsWith('Bearer ')) {
      const accessToken = authorization.slice('Bearer '.length).trim();
      const authClient = createClient(supabaseUrl, anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const {
        data: { user },
      } = await authClient.auth.getUser(accessToken);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return jsonResponse(401, {
        success: false,
        saved: false,
        exported: false,
        error: 'Sign in to send chapter feedback',
      });
    }

    // Server-verify Scripture Council membership and take the participant identity from the
    // server, ignoring whatever the client payload claims (S1).
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select(
        'chapter_feedback_enabled, chapter_feedback_name, chapter_feedback_role, chapter_feedback_id_number'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (prefsError) {
      return jsonResponse(500, {
        success: false,
        saved: false,
        exported: false,
        error: prefsError.message,
      });
    }

    if (!prefs?.chapter_feedback_enabled) {
      return jsonResponse(403, {
        success: false,
        saved: false,
        exported: false,
        error: 'Chapter feedback is not enabled for this account',
      });
    }

    // Per-user flood guard (S3, S8).
    const rateWindowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rateError } = await supabase
      .from('chapter_feedback_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', rateWindowStart);

    if (!rateError && (recentCount ?? 0) >= SUBMISSION_RATE_LIMIT_PER_HOUR) {
      return jsonResponse(429, {
        success: false,
        saved: false,
        exported: false,
        error: 'Too many submissions. Please try again later.',
      });
    }

    const requestBody = (await req.json().catch(() => ({}))) as ChapterFeedbackRequest;
    const validation = validateRequest(requestBody, userId);

    if (!validation.value) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    let uploadedAudioPath: string | null = null;
    if (validation.pendingAudioUpload) {
      const { error: uploadError } = await supabase.storage
        .from('chapter-feedback-audio')
        .upload(
          validation.pendingAudioUpload.path,
          decodeBase64(validation.pendingAudioUpload.base64Data),
          {
            contentType: validation.pendingAudioUpload.mimeType,
            upsert: false,
          }
        );

      if (uploadError) {
        return jsonResponse(500, {
          success: false,
          saved: false,
          exported: false,
          error: uploadError.message,
        });
      }

      uploadedAudioPath = validation.pendingAudioUpload.path;
    }

    const insertPayload: ChapterFeedbackInsert = {
      ...validation.value,
      user_id: userId,
      participant_name: trimOptionalText(prefs.chapter_feedback_name),
      participant_role: trimOptionalText(prefs.chapter_feedback_role),
      participant_id_number: trimOptionalText(prefs.chapter_feedback_id_number),
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('chapter_feedback_submissions')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insertedRow) {
      // Don't orphan the just-uploaded audio object if the row insert fails (S7).
      if (uploadedAudioPath) {
        await supabase.storage.from('chapter-feedback-audio').remove([uploadedAudioPath]);
      }

      return jsonResponse(500, {
        success: false,
        saved: false,
        exported: false,
        error: insertError?.message ?? 'Failed to save chapter feedback',
      });
    }

    const feedbackRow = insertedRow as ChapterFeedbackRow;

    return jsonResponse(200, {
      success: true,
      saved: true,
      exported: true,
      feedbackId: feedbackRow.id,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      saved: false,
      exported: false,
      error: error instanceof Error ? error.message : 'Unknown submit-chapter-feedback error',
    });
  }
});
