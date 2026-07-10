import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ReviewResolution = 'fixed' | 'no_change_needed';

interface ReviewRequest {
  passcode?: string;
  validateOnly?: boolean;
  translationId?: string;
  bookId?: string;
  chapter?: number;
  // Resolution mutation mode (Phase 1: server-backed translator mark-offs).
  action?: 'resolve' | 'reopen';
  feedbackId?: string;
  resolution?: ReviewResolution;
  note?: string;
}

interface ChapterFeedbackReviewRow {
  id: string;
  created_at: string;
  translation_id: string;
  translation_language: string;
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  comment: string | null;
  participant_name: string | null;
  participant_role: string | null;
  participant_id_number: string | null;
  user_id: string | null;
  source_screen: string;
  audio_response_bucket: string | null;
  audio_response_path: string | null;
  audio_response_mime_type: string | null;
  audio_response_size_bytes: number | null;
  audio_response_duration_ms: number | null;
  audio_response_created_at: string | null;
  scripture_council_resolution: ReviewResolution | null;
  scripture_council_fixed_at: string | null;
  scripture_council_fixed_note: string | null;
}

interface ChapterFeedbackSummaryRow {
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  scripture_council_resolution: ReviewResolution | null;
}

const SUMMARY_ROW_LIMIT = 5000;

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const getRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
};

const trimRequiredText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isResolution = (value: unknown): value is ReviewResolution =>
  value === 'fixed' || value === 'no_change_needed';

// Brute-force protection for the shared translator passcode (S2). A hashed client IP is
// locked out after too many failed attempts in a short window; the check runs before the
// passcode comparison so it also covers `validateOnly` probes.
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_WINDOW_MINUTES = 15;

const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown';
};

const hashClientIp = async (request: Request): Promise<string> => {
  const data = new TextEncoder().encode(getClientIp(request));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const isPasscodeLockedOut = async (
  service: ReturnType<typeof createClient>,
  ipHash: string
): Promise<boolean> => {
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await service
    .from('translator_review_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('succeeded', false)
    .gte('created_at', windowStart);

  if (error) {
    // Fail open on the counter rather than lock every translator out on a transient error.
    return false;
  }

  return (count ?? 0) >= LOCKOUT_THRESHOLD;
};

const recordPasscodeAttempt = async (
  service: ReturnType<typeof createClient>,
  ipHash: string,
  succeeded: boolean
): Promise<void> => {
  await service.from('translator_review_attempts').insert({ ip_hash: ipHash, succeeded });
};

// Resolve the acting translator's user id from an optional bearer token so we can
// attribute fixes when a signed-in translator marks feedback off. Passcode-only
// translators (no JWT) resolve to null, which the column allows.
const resolveActingUserId = async (
  request: Request,
  service: ReturnType<typeof createClient>
): Promise<string | null> => {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return null;
  }

  try {
    const { data, error } = await service.auth.getUser(token);
    if (error) {
      return null;
    }
    return data.user?.id ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = (await request.json()) as ReviewRequest;

    const supabaseUrl = getRequiredSecret('SUPABASE_URL');
    const serviceRoleKey = getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY');
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const ipHash = await hashClientIp(request);

    if (await isPasscodeLockedOut(service, ipHash)) {
      return jsonResponse(429, {
        success: false,
        error: 'Too many attempts. Try again later.',
      });
    }

    const expectedPasscode = getRequiredSecret('TRANSLATOR_REVIEW_PASSCODE');

    if (body.passcode !== expectedPasscode) {
      await recordPasscodeAttempt(service, ipHash, false);
      return jsonResponse(403, { success: false, error: 'Translator access denied' });
    }

    if (body.validateOnly === true) {
      return jsonResponse(200, { success: true });
    }

    // --- Resolution mutation mode (translator marks feedback fixed / reopened) ---
    if (body.action === 'resolve' || body.action === 'reopen') {
      const feedbackId = trimRequiredText(body.feedbackId);
      const translationId = trimRequiredText(body.translationId);

      if (!feedbackId) {
        return jsonResponse(400, { success: false, error: 'feedbackId is required' });
      }

      // Confirm the row exists and belongs to the requested translation before mutating.
      let existingQuery = service
        .from('chapter_feedback_submissions')
        .select('id, translation_id')
        .eq('id', feedbackId)
        .limit(1);

      if (translationId) {
        existingQuery = existingQuery.eq('translation_id', translationId);
      }

      const { data: existing, error: existingError } = await existingQuery.maybeSingle();

      if (existingError) {
        return jsonResponse(500, { success: false, error: existingError.message });
      }

      if (!existing) {
        return jsonResponse(404, { success: false, error: 'Feedback item not found' });
      }

      if (body.action === 'reopen') {
        const { error: reopenError } = await service
          .from('chapter_feedback_submissions')
          .update({
            scripture_council_resolution: null,
            scripture_council_fixed_at: null,
            scripture_council_fixed_by: null,
            scripture_council_fixed_note: null,
          })
          .eq('id', feedbackId);

        if (reopenError) {
          return jsonResponse(500, { success: false, error: reopenError.message });
        }

        return jsonResponse(200, { success: true, feedbackId, resolution: null });
      }

      if (!isResolution(body.resolution)) {
        return jsonResponse(400, {
          success: false,
          error: 'resolution must be "fixed" or "no_change_needed"',
        });
      }

      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (note.length > 1000) {
        return jsonResponse(400, { success: false, error: 'note must be 1000 characters or fewer' });
      }

      const fixedBy = await resolveActingUserId(request, service);

      const { error: resolveError } = await service
        .from('chapter_feedback_submissions')
        .update({
          scripture_council_resolution: body.resolution,
          scripture_council_fixed_at: new Date().toISOString(),
          scripture_council_fixed_by: fixedBy,
          scripture_council_fixed_note: note.length > 0 ? note : null,
        })
        .eq('id', feedbackId);

      if (resolveError) {
        return jsonResponse(500, { success: false, error: resolveError.message });
      }

      return jsonResponse(200, {
        success: true,
        feedbackId,
        resolution: body.resolution,
      });
    }

    // --- Read modes (summary counts + per-chapter detail) ---
    const translationId = trimRequiredText(body.translationId);
    const bookId = trimRequiredText(body.bookId)?.toUpperCase() ?? null;

    if (!translationId) {
      return jsonResponse(400, {
        success: false,
        error: 'translationId is required',
      });
    }

    const hasChapter = body.chapter != null;
    if (hasChapter && (!bookId || !Number.isInteger(body.chapter) || (body.chapter ?? 0) < 1)) {
      return jsonResponse(400, {
        success: false,
        error: 'bookId and a valid chapter are required',
      });
    }

    if (!hasChapter) {
      let summaryQuery = service
        .from('chapter_feedback_submissions')
        .select('book_id, chapter, sentiment, scripture_council_resolution')
        .eq('translation_id', translationId)
        .order('book_id', { ascending: true })
        .order('chapter', { ascending: true })
        .limit(SUMMARY_ROW_LIMIT);

      if (bookId) {
        summaryQuery = summaryQuery.eq('book_id', bookId);
      }

      const { data: summaryData, error: summaryError } = await summaryQuery;

      if (summaryError) {
        return jsonResponse(500, { success: false, error: summaryError.message });
      }

      const rows = (summaryData ?? []) as ChapterFeedbackSummaryRow[];

      const summaryByChapter = new Map<
        string,
        {
          bookId: string;
          chapter: number;
          total: number;
          unresolvedDown: number;
          unresolvedUp: number;
        }
      >();

      rows.forEach((row) => {
        const key = `${row.book_id}:${row.chapter}`;
        const summary =
          summaryByChapter.get(key) ??
          {
            bookId: row.book_id,
            chapter: row.chapter,
            total: 0,
            unresolvedDown: 0,
            unresolvedUp: 0,
          };

        summary.total += 1;
        if (row.scripture_council_resolution == null) {
          if (row.sentiment === 'down') {
            summary.unresolvedDown += 1;
          } else {
            summary.unresolvedUp += 1;
          }
        }
        summaryByChapter.set(key, summary);
      });

      return jsonResponse(200, {
        success: true,
        chapters: Array.from(summaryByChapter.values()),
        truncated: rows.length >= SUMMARY_ROW_LIMIT,
      });
    }

    const { data, error } = await service
      .from('chapter_feedback_submissions')
      .select(
        'id, created_at, translation_id, translation_language, book_id, chapter, sentiment, comment, participant_name, participant_role, participant_id_number, user_id, source_screen, audio_response_bucket, audio_response_path, audio_response_mime_type, audio_response_size_bytes, audio_response_duration_ms, audio_response_created_at, scripture_council_resolution, scripture_council_fixed_at, scripture_council_fixed_note'
      )
      .eq('translation_id', translationId)
      .eq('book_id', bookId)
      .eq('chapter', body.chapter)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return jsonResponse(500, { success: false, error: error.message });
    }

    const rows = (data ?? []) as ChapterFeedbackReviewRow[];
    const signedAudioUrls = await Promise.all(
      rows.map(async (row) => {
        if (!row.audio_response_bucket || !row.audio_response_path) {
          return null;
        }

        const { data: signedUrlData, error: signedUrlError } = await service.storage
          .from(row.audio_response_bucket)
          .createSignedUrl(row.audio_response_path, 60 * 60);

        if (signedUrlError) {
          return null;
        }

        return signedUrlData.signedUrl;
      })
    );

    return jsonResponse(200, {
      success: true,
      feedback: rows.map((row, index) => ({
        id: row.id,
        createdAt: row.created_at,
        translationId: row.translation_id,
        translationLanguage: row.translation_language,
        bookId: row.book_id,
        chapter: row.chapter,
        sentiment: row.sentiment,
        comment: row.comment,
        participantName: row.participant_name,
        participantRole: row.participant_role,
        // Legacy rows stored the raw Supabase UUID here; never surface it to translators (S4).
        participantIdNumber:
          row.participant_id_number && row.participant_id_number === row.user_id
            ? null
            : row.participant_id_number,
        userId: row.user_id,
        sourceScreen: row.source_screen,
        resolution: row.scripture_council_resolution,
        resolvedAt: row.scripture_council_fixed_at,
        resolutionNote: row.scripture_council_fixed_note,
        audioResponse:
          row.audio_response_path && row.audio_response_duration_ms && row.audio_response_mime_type
            ? {
                createdAt: row.audio_response_created_at,
                durationMs: row.audio_response_duration_ms,
                mimeType: row.audio_response_mime_type,
                playbackUrl: signedAudioUrls[index],
                sizeBytes: row.audio_response_size_bytes,
              }
            : null,
      })),
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to load feedback review.',
    });
  }
});
