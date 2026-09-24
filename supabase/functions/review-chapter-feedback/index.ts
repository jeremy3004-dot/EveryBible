import { verifyCouncilAccess } from '../_shared/councilAccess.ts';
import {
  hashPasscodeAttemptKey,
  readPasscodeLockout,
  recordFailedPasscodeAttempt,
} from '../_shared/passcodeAttempts.ts';
import {
  AUDIO_URL_TTL_SECONDS,
  type ChapterFeedbackReviewRow,
  LEGACY_LIST_AUDIO_URL_TTL_SECONDS,
  type ReviewResolution,
  signsListAudio,
  toReviewFeedbackItem,
} from './reviewPayload.ts';
import {
  accessCoversTranslation,
  parseSharedPasscodeScope,
  recordSharedPasscodeUse,
  resolveTranslatorAccess,
  sharedPasscodeRequestKind,
  type TranslatorAccess,
} from './translatorAccess.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewRequest {
  apiVersion?: number;
  accessRole?: 'scripture_council';
  category?: 'all' | 'community' | 'scripture_council';
  status?: 'pending' | 'reviewed' | 'all';
  cursor?: { snapshot: number; sequence: number; sentiment: string };
  positiveOnly?: boolean;
  summaryOnly?: boolean;
  feedbackIds?: string[];
  passcode?: string;
  validateOnly?: boolean;
  translationId?: string;
  bookId?: string;
  chapter?: number;
  // Resolution mutation mode (Phase 1: server-backed translator mark-offs).
  action?: 'audioUrl' | 'resolve' | 'reopen' | 'positivePreview' | 'reviewPositiveIds';
  feedbackId?: string;
  resolution?: ReviewResolution;
  note?: string;
}

interface ChapterFeedbackSummaryRow {
  id: string;
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  scripture_council_resolution: ReviewResolution | null;
  audio_response_path: string | null;
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

// Passcode holders are not trusted operators, so database, storage, and configuration details
// go to the function log, never into the response (audit 2026-09-24 L7).
const INTERNAL_ERROR_MESSAGE = 'Unable to load feedback review. Please try again later.';

const internalErrorResponse = (context: string, detail: unknown) => {
  console.error(`[review-chapter-feedback] ${context}`, detail);
  return jsonResponse(500, { success: false, error: INTERNAL_ERROR_MESSAGE });
};

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

// Brute-force protection for translator passcodes (S2) lives in
// _shared/passcodeAttempts.ts, keyed on the edge-stamped client address (never on the
// caller's own x-forwarded-for). The lockout check runs before any passcode comparison so it
// also covers `validateOnly` probes. Team and shared passcodes share one counter.

// A passcode opens only the translations its team row (or the shared code's scope) lists.
// Every read and mutation below names a translationId and filters by it, so checking that id
// here scopes the whole request.
const translationNotCovered = () =>
  jsonResponse(403, {
    success: false,
    error: 'This access code does not cover this translation',
    code: 'translation_not_covered',
  });

// Resolve the acting translator's user id from an optional bearer token so we can
// attribute fixes when a signed-in translator marks feedback off. Passcode-only
// translators (no JWT) resolve to null, which the column allows.
const resolveActingUserId = async (
  request: Request,
  service: SupabaseClient
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

    if (body.accessRole === 'scripture_council') {
      if (body.validateOnly !== true) return jsonResponse(403, { success: false, error: 'Translator access required' });
      const denied = await verifyCouncilAccess(service, request, body.passcode);
      return denied ? jsonResponse(denied.status, { success: false, error: denied.error })
        : jsonResponse(200, { success: true });
    }

    const ipHash = await hashPasscodeAttemptKey(request);
    const tooManyAttempts = () =>
      jsonResponse(429, { success: false, error: 'Too many attempts. Try again later.' });
    // Fail CLOSED: without a readable (and writable) attempt counter there is no brute-force
    // limit, so the passcode is not checked at all.
    const accessUnavailable = () =>
      jsonResponse(503, {
        success: false,
        error: 'Unable to verify translator access. Try again later.',
      });

    const lockout = await readPasscodeLockout(service, ipHash);
    if (lockout === 'unavailable') return accessUnavailable();
    if (lockout === 'locked') return tooManyAttempts();

    const resolved = await resolveTranslatorAccess(
      service,
      typeof body.passcode === 'string' ? body.passcode : '',
      {
        passcode: Deno.env.get('TRANSLATOR_REVIEW_PASSCODE')?.trim() || undefined,
        translationIds: parseSharedPasscodeScope(
          Deno.env.get('TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS')
        ),
      }
    );
    if (resolved.status === 'unavailable') return accessUnavailable();

    // Shows the owner who still depends on the shared code before (and after) it is switched off.
    const sharedOutcome =
      resolved.status === 'granted'
        ? resolved.access.kind === 'shared' ? 'allowed' : null
        : resolved.sharedPasscodeRefused ? 'refused' : null;
    if (sharedOutcome) {
      await recordSharedPasscodeUse(service, {
        translationId: body.translationId,
        requestKind: sharedPasscodeRequestKind(body),
        outcome: sharedOutcome,
      });
    }

    // A switched-off shared code is answered exactly like a wrong code, including the lockout.
    if (resolved.status === 'denied') {
      // Record the failed attempt FIRST, then evaluate the lockout from a count
      // that includes it. Recording-then-counting closes the check-then-insert
      // race where parallel wrong-passcode requests all read count < threshold
      // before any INSERT lands (each otherwise getting a fresh guess). Combined
      // with the un-spoofable cf-connecting-ip key, a burst can no longer exceed
      // the window budget.
      if (!(await recordFailedPasscodeAttempt(service, ipHash))) return accessUnavailable();
      const afterFailure = await readPasscodeLockout(service, ipHash);
      if (afterFailure === 'unavailable') return accessUnavailable();
      if (afterFailure === 'locked') return tooManyAttempts();
      return jsonResponse(403, { success: false, error: 'Translator access denied' });
    }

    const access: TranslatorAccess = resolved.access;

    if (body.validateOnly === true) {
      // The unlock screen learns the code's scope here. Unlocking always succeeds for a valid
      // code, even while the reader shows a translation it does not cover, because the
      // translator may switch to their own translation next. Older app builds ignore both
      // extra fields.
      const requested = trimRequiredText(body.translationId);
      return jsonResponse(200, {
        success: true,
        translationIds: access.translationIds,
        ...(requested ? { coversTranslation: accessCoversTranslation(access, requested) } : {}),
      });
    }

    // --- Resolution mutation mode (translator marks feedback fixed / reopened) ---
    if (body.action === 'resolve' || body.action === 'reopen') {
      const feedbackId = trimRequiredText(body.feedbackId);
      const translationId = trimRequiredText(body.translationId);

      if (!feedbackId) {
        return jsonResponse(400, { success: false, error: 'feedbackId is required' });
      }

      // translationId is REQUIRED for mutations (S4) and must be inside the passcode's scope.
      // Without it a passcode holder could resolve or reopen another translation's feedback by
      // guessing/replaying a feedback UUID. The app already sends it on both actions
      // (src/services/feedback/chapterFeedbackReviewService.ts resolve/reopen bodies).
      if (!translationId) {
        return jsonResponse(400, { success: false, error: 'translationId is required' });
      }
      if (!accessCoversTranslation(access, translationId)) return translationNotCovered();

      // Confirm the row exists and belongs to the requested translation before mutating.
      const { data: existing, error: existingError } = await service
        .from('chapter_feedback_submissions')
        .select('id, translation_id, sentiment')
        .eq('id', feedbackId)
        .eq('translation_id', translationId)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        return internalErrorResponse('feedback lookup failed', existingError);
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
          .eq('id', feedbackId)
          .eq('translation_id', translationId);

        if (reopenError) {
          return internalErrorResponse('reopen failed', reopenError);
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
      if (body.apiVersion === 2 && existing.sentiment === 'down' && !note) {
        return jsonResponse(400, { success: false, error: 'An explanation is required.' });
      }
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
        .eq('id', feedbackId)
        .eq('translation_id', translationId);

      if (resolveError) {
        return internalErrorResponse('resolve failed', resolveError);
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
    if (!accessCoversTranslation(access, translationId)) return translationNotCovered();

    const hasChapter = body.chapter != null;
    if (hasChapter && (!bookId || !Number.isInteger(body.chapter) || (body.chapter ?? 0) < 1)) {
      return jsonResponse(400, {
        success: false,
        error: 'bookId and a valid chapter are required',
      });
    }

    if (body.apiVersion === 2 && body.action === 'audioUrl') {
      if (!hasChapter || !trimRequiredText(body.feedbackId)) {
        return jsonResponse(400, { success: false, error: 'Chapter and feedbackId required' });
      }
      const { data: audio, error } = await service.from('chapter_feedback_submissions')
        .select('audio_response_bucket, audio_response_path').eq('id', body.feedbackId)
        .eq('translation_id', translationId).eq('book_id', bookId).eq('chapter', body.chapter)
        .maybeSingle();
      if (error) return internalErrorResponse('recording lookup failed', error);
      if (!audio?.audio_response_path || !audio.audio_response_bucket) {
        return jsonResponse(404, { success: false, error: 'Recording not found' });
      }
      const signed = await service.storage.from(audio.audio_response_bucket)
        .createSignedUrl(audio.audio_response_path, AUDIO_URL_TTL_SECONDS);
      return signed.error ? jsonResponse(500, { success: false, error: 'Recording unavailable' })
        : jsonResponse(200, { success: true, playbackUrl: signed.data.signedUrl });
    }

    if (body.apiVersion === 2) {
      const category = body.category ?? 'all';
      const status = body.status ?? 'pending';
      if (!['all', 'community', 'scripture_council'].includes(category)
          || !['pending', 'reviewed', 'all'].includes(status)) {
        return jsonResponse(400, { success: false, error: 'Invalid feedback filter' });
      }
      if (body.action === 'positivePreview' || body.action === 'reviewPositiveIds') {
        if (!hasChapter) return jsonResponse(400, { success: false, error: 'Chapter required' });
        if (body.action === 'reviewPositiveIds' && (!Array.isArray(body.feedbackIds)
            || body.feedbackIds.length > 500 || !body.feedbackIds.every(id => typeof id === 'string'))) {
          return jsonResponse(400, { success: false, error: 'Invalid response selection' });
        }
        const { data, error } = body.action === 'positivePreview'
          ? await service.rpc('chapter_feedback_positive_preview', {
              p_translation: translationId, p_book: bookId, p_chapter: body.chapter, p_category: category,
            })
          : await service.rpc('chapter_feedback_review_positive_ids', {
              p_translation: translationId, p_book: bookId, p_chapter: body.chapter,
              p_ids: body.feedbackIds, p_actor: await resolveActingUserId(request, service),
            });
        if (error) return internalErrorResponse('positive feedback query failed', error);
        return jsonResponse(200, { success: true, feedbackIds: body.action === 'positivePreview' ? data : undefined,
          reviewedCount: body.action === 'reviewPositiveIds' ? data : undefined });
      }
    }

    if (!hasChapter && body.apiVersion !== 2) {
      let summaryQuery = service
        .from('chapter_feedback_submissions')
        .select('id, book_id, chapter, sentiment, scripture_council_resolution, audio_response_path')
        .eq('translation_id', translationId)
        .order('book_id', { ascending: true })
        .order('chapter', { ascending: true })
        .limit(SUMMARY_ROW_LIMIT);

      if (bookId) {
        summaryQuery = summaryQuery.eq('book_id', bookId);
      }

      const { data: summaryData, error: summaryError } = await summaryQuery;

      if (summaryError) {
        return internalErrorResponse('summary query failed', summaryError);
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
          // Back-compat (B3): pre-1.0.5 app builds read a per-chapter `feedback`
          // array (summary.feedback.length / .some(hasAudio)). New clients use the
          // count fields above and ignore this, but old binaries TypeError without
          // it, so it must live INSIDE each chapter item (not at the top level).
          feedback: Array<{ id: string; hasAudio: boolean }>;
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
            feedback: [] as Array<{ id: string; hasAudio: boolean }>,
          };

        summary.total += 1;
        summary.feedback.push({ id: row.id, hasAudio: row.audio_response_path != null });
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

    const legacyQuery = service
      .from('chapter_feedback_submissions')
      .select(
        'id, created_at, translation_id, translation_language, book_id, chapter, sentiment, comment, participant_name, participant_role, participant_id_number, user_id, source_screen, audio_response_bucket, audio_response_path, audio_response_mime_type, audio_response_size_bytes, audio_response_duration_ms, audio_response_created_at, contributor_category, scripture_council_resolution, scripture_council_fixed_at, scripture_council_fixed_note'
      )
      .eq('translation_id', translationId)
      .eq('book_id', bookId)
      .eq('chapter', body.chapter)
      .order('created_at', { ascending: false })
      .limit(200);

    const { data, error } = body.apiVersion === 2
      ? await service.rpc('chapter_feedback_review_v2', {
          p_translation: translationId, p_book: bookId, p_chapter: body.chapter ?? null,
          p_category: body.category ?? 'all', p_status: body.status ?? 'pending',
          p_cursor: body.cursor ?? null, p_positive_only: body.positiveOnly ?? false,
          p_summary_only: body.summaryOnly ?? false,
        })
      : await legacyQuery;

    if (error) {
      return internalErrorResponse('chapter review query failed', error);
    }

    if (body.apiVersion === 2 && (!hasChapter || body.summaryOnly)) {
      return jsonResponse(200, { success: true, chapters: data.chapters });
    }
    const rows = (body.apiVersion === 2 ? data.rows : data ?? []) as ChapterFeedbackReviewRow[];
    const signedAudioUrls = await Promise.all(
      rows.map(async (row) => {
        if (!signsListAudio(body.apiVersion) || !row.audio_response_bucket || !row.audio_response_path) {
          return null;
        }

        const { data: signedUrlData, error: signedUrlError } = await service.storage
          .from(row.audio_response_bucket)
          .createSignedUrl(row.audio_response_path, LEGACY_LIST_AUDIO_URL_TTL_SECONDS);

        if (signedUrlError) {
          return null;
        }

        return signedUrlData.signedUrl;
      })
    );

    return jsonResponse(200, {
      success: true,
      ...(body.apiVersion === 2 ? { summary: data.chapters[0] ?? null, nextCursor: data.nextCursor, positiveCount: data.positiveCount } : {}),
      feedback: rows.map((row, index) =>
        toReviewFeedbackItem(row, body.apiVersion, signedAudioUrls[index])
      ),
    });
  } catch (error) {
    return internalErrorResponse('unhandled error', error);
  }
});
