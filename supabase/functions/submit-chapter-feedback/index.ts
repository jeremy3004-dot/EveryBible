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

const base64DecodedSize = (base64Data: string): number => {
  const normalized = base64Data.replace(/\s/g, '');
  const paddingBytes = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - paddingBytes;
};

const decodeBase64 = (base64Data: string): Uint8Array => {
  const binaryString = atob(base64Data.replace(/\s/g, ''));
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

  if (!Number.isInteger(body.chapter) || (body.chapter ?? 0) < 1) {
    return { error: 'chapter must be an integer greater than or equal to 1' };
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

    if (audioResponse.mimeType !== 'audio/mp4') {
      return { error: 'audio response must use audio/mp4' };
    }

    if (
      !Number.isInteger(audioResponse.durationMs) ||
      (audioResponse.durationMs ?? 0) < 500 ||
      (audioResponse.durationMs ?? 0) > 120000
    ) {
      return { error: 'audio response duration must be between 0.5 and 120 seconds' };
    }

    if (
      audioResponse.sizeBytes != null &&
      (!Number.isInteger(audioResponse.sizeBytes) ||
        audioResponse.sizeBytes < 1 ||
        audioResponse.sizeBytes > 5242880)
    ) {
      return { error: 'audio response size must be 5 MB or smaller' };
    }

    const createdAtTime = Date.parse(audioResponse.createdAt ?? '');
    if (!Number.isFinite(createdAtTime)) {
      return { error: 'audio response createdAt must be an ISO timestamp' };
    }

    if (base64Data) {
      if (
        audioResponse.sizeBytes != null &&
        base64DecodedSize(base64Data) !== audioResponse.sizeBytes
      ) {
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
      book_id: bookId,
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

    const requestBody = (await req.json().catch(() => ({}))) as ChapterFeedbackRequest;
    const validation = validateRequest(requestBody, userId);

    if (!validation.value) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

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
    }

    const insertPayload: ChapterFeedbackInsert = {
      ...validation.value,
      user_id: userId,
      participant_id_number: userId,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('chapter_feedback_submissions')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insertedRow) {
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
      exported: false,
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
