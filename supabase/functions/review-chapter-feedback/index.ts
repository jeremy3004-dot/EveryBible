import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewRequest {
  passcode?: string;
  translationId?: string;
  bookId?: string;
  chapter?: number;
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
}

interface ChapterFeedbackSummaryRow {
  id: string;
  book_id: string;
  chapter: number;
  audio_response_path: string | null;
}

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = (await request.json()) as ReviewRequest;
    const expectedPasscode = Deno.env.get('TRANSLATOR_REVIEW_PASSCODE')?.trim() || '342121';

    if (body.passcode !== expectedPasscode) {
      return jsonResponse(403, { success: false, error: 'Translator access denied' });
    }

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

    const supabaseUrl = getRequiredSecret('SUPABASE_URL');
    const serviceRoleKey = getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY');
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (!hasChapter) {
      let summaryQuery = service
        .from('chapter_feedback_submissions')
        .select('id, book_id, chapter, audio_response_path')
        .eq('translation_id', translationId)
        .order('book_id', { ascending: true })
        .order('chapter', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(5000);

      if (bookId) {
        summaryQuery = summaryQuery.eq('book_id', bookId);
      }

      const { data: summaryData, error: summaryError } = await summaryQuery;

      if (summaryError) {
        return jsonResponse(500, { success: false, error: summaryError.message });
      }

      const summaryByChapter = new Map<
        string,
        { bookId: string; chapter: number; feedback: Array<{ id: string; hasAudio: boolean }> }
      >();

      ((summaryData ?? []) as ChapterFeedbackSummaryRow[]).forEach((row) => {
        const key = `${row.book_id}:${row.chapter}`;
        const summary =
          summaryByChapter.get(key) ??
          {
            bookId: row.book_id,
            chapter: row.chapter,
            feedback: [],
          };

        summary.feedback.push({
          id: row.id,
          hasAudio: row.audio_response_path != null,
        });
        summaryByChapter.set(key, summary);
      });

      return jsonResponse(200, {
        success: true,
        chapters: Array.from(summaryByChapter.values()),
      });
    }

    const { data, error } = await service
      .from('chapter_feedback_submissions')
      .select(
        'id, created_at, translation_id, translation_language, book_id, chapter, sentiment, comment, participant_name, participant_role, participant_id_number, user_id, source_screen, audio_response_bucket, audio_response_path, audio_response_mime_type, audio_response_size_bytes, audio_response_duration_ms, audio_response_created_at'
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
        participantIdNumber: row.participant_id_number,
        userId: row.user_id,
        sourceScreen: row.source_screen,
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
