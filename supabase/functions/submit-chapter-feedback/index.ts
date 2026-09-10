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
  client_ip_hash: string | null;
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

// Max submissions per account or anonymous identity per rolling hour.
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

// S6: stable identity for the anonymous submission rate limit. Copied from
// review-chapter-feedback/index.ts:90-129 so both credential-free feedback endpoints key
// their throttles on the same value.
const getClientIp = (request: Request): string => {
  // Prefer cf-connecting-ip: on Supabase's Cloudflare edge this is stamped by the proxy and
  // cannot be spoofed by the client, unlike the first x-forwarded-for entry (which the client
  // controls — trusted proxies append the real IP, they do not prepend it).
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
};

// Only the digest is ever persisted — chapter_feedback_submissions.client_ip_hash stores no
// raw address, and review-chapter-feedback never returns the column to translators.
const hashClientIp = async (request: Request): Promise<string> => {
  const data = new TextEncoder().encode(getClientIp(request));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

  if (!participantName || !participantRole) {
    return { error: 'participantName and participantRole are required' };
  }

  if (participantName.length > 120 || participantRole.length > 120) {
    return { error: 'participantName and participantRole must be 120 characters or fewer' };
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
      // Reject traversal / separator tricks BEFORE the prefix check: a path such as
      // `<uid>/../<other-uid>/clip.m4a` passes startsWith but escapes the caller's own
      // storage prefix, and a backslash is a legal object-key byte that some clients and
      // path normalizers fold into a separator (S6).
      if (preuploadedAudioPath.includes('..') || preuploadedAudioPath.includes('\\')) {
        return { error: 'audio response path is invalid for this user' };
      }

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
      // Filled in by the handler, which owns the Request and therefore the client IP.
      client_ip_hash: null,
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

    // Authentication is optional. A valid session enriches the row with user_id, while
    // every participant is authorized by supplying the required name and project role.
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

    // S6: the anonymous branch used to be scoped by participant_name + participant_role —
    // two free-text fields straight from the request body, so rotating a name reset the
    // counter and the limit was a formality. Anonymous submitters are now scoped by a hash of
    // the client IP (cf-connecting-ip, which the Cloudflare edge stamps and the client cannot
    // forge). Signed-in submitters keep the user_id scope, which was already un-spoofable.
    const clientIpHash = await hashClientIp(req);
    const rateWindowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rateQuery = supabase
      .from('chapter_feedback_submissions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', rateWindowStart);
    const scopedRateQuery = userId
      ? rateQuery.eq('user_id', userId)
      : rateQuery.is('user_id', null).eq('client_ip_hash', clientIpHash);
    const { count: recentCount, error: rateError } = await scopedRateQuery;

    // S6: fail CLOSED. This endpoint runs with verify_jwt = false, so if the counter query is
    // the only thing standing between an anonymous caller and unbounded service-role inserts,
    // an error on that query must not wave the request through. The message stays generic so a
    // caller cannot tell a counter outage apart from being throttled.
    if (rateError) {
      return jsonResponse(503, {
        success: false,
        saved: false,
        exported: false,
        error: 'Unable to accept feedback right now. Please try again later.',
      });
    }

    if ((recentCount ?? 0) >= SUBMISSION_RATE_LIMIT_PER_HOUR) {
      return jsonResponse(429, {
        success: false,
        saved: false,
        exported: false,
        error: 'Too many submissions. Please try again later.',
      });
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
      client_ip_hash: clientIpHash,
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
