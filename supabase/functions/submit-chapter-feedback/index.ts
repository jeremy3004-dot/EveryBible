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
  sourceScreen?: string;
  appPlatform?: string | null;
  appVersion?: string | null;
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

const getRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
};

const validateRequest = (
  body: ChapterFeedbackRequest
): { value?: ChapterFeedbackInsert; error?: string } => {
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
      book_id: bookId,
      chapter: body.chapter,
      sentiment: body.sentiment,
      comment,
      source_screen: requireNonEmptyString(body.sourceScreen) ?? 'reader',
      app_platform: trimOptionalText(body.appPlatform),
      app_version: trimOptionalText(body.appVersion),
      export_status: 'exported',
    },
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
    const validation = validateRequest(requestBody);

    if (!validation.value) {
      return jsonResponse(400, { success: false, error: validation.error });
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
