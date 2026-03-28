import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_HEADER = [
  'submission_id',
  'created_at',
  'translation_language',
  'translation_id',
  'book_id',
  'chapter',
  'sentiment',
  'comment',
  'interface_language',
  'content_language_code',
  'content_language_name',
  'source_screen',
  'app_platform',
  'app_version',
  'user_id',
];

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
  sourceScreen?: string;
  appPlatform?: string | null;
  appVersion?: string | null;
}

interface ChapterFeedbackInsert {
  user_id: string;
  translation_id: string;
  translation_language: string;
  interface_language: string;
  content_language_code: string | null;
  content_language_name: string | null;
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

const normalizeSheetTitle = (value: string): string => {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Unknown Language').slice(0, 100);
};

const encodeBase64Url = (value: string | Uint8Array): string => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodePem = (pem: string): Uint8Array => {
  const sanitized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(sanitized);
  const output = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }

  return output;
};

const getRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
};

const createGoogleAccessToken = async (): Promise<string> => {
  const serviceAccountEmail = getRequiredSecret('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getRequiredSecret('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(
    /\\n/g,
    '\n'
  );
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: issuedAt + 3600,
      iat: issuedAt,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );
  const assertion = `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed with ${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Google token response did not include access_token');
  }

  return json.access_token;
};

const googleSheetsRequest = async <T>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown Google Sheets error');
    throw new Error(`Google Sheets request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
};

const ensureSheetExists = async (
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<void> => {
  const metadata = await googleSheetsRequest<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    accessToken,
    `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`
  );
  const alreadyExists = metadata.sheets?.some((sheet) => sheet.properties?.title === sheetTitle);

  if (alreadyExists) {
    return;
  }

  await googleSheetsRequest<Record<string, never>>(
    accessToken,
    `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          },
        ],
      }),
    }
  );
};

const ensureHeaderRow = async (
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<void> => {
  const range = encodeURIComponent(`${sheetTitle}!1:1`);
  const existing = await googleSheetsRequest<{ values?: string[][] }>(
    accessToken,
    `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${range}`
  );
  const existingHeader = existing.values?.[0] ?? [];

  if (existingHeader.join('|') === SHEET_HEADER.join('|')) {
    return;
  }

  await googleSheetsRequest<Record<string, never>>(
    accessToken,
    `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [SHEET_HEADER],
      }),
    }
  );
};

const appendSheetRow = async (
  accessToken: string,
  spreadsheetId: string,
  row: ChapterFeedbackRow
): Promise<void> => {
  const sheetTitle = normalizeSheetTitle(row.translation_language);
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);
  await ensureHeaderRow(accessToken, spreadsheetId, sheetTitle);

  const range = encodeURIComponent(`${sheetTitle}!A:O`);
  await googleSheetsRequest<Record<string, never>>(
    accessToken,
    `${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [
          [
            row.id,
            row.created_at,
            row.translation_language,
            row.translation_id,
            row.book_id,
            row.chapter,
            row.sentiment,
            row.comment ?? '',
            row.interface_language,
            row.content_language_code ?? '',
            row.content_language_name ?? '',
            row.source_screen,
            row.app_platform ?? '',
            row.app_version ?? '',
            row.user_id,
          ],
        ],
      }),
    }
  );
};

const validateRequest = (body: ChapterFeedbackRequest): { value?: ChapterFeedbackInsert; error?: string } => {
  const translationId = requireNonEmptyString(body.translationId);
  const translationLanguage = requireNonEmptyString(body.translationLanguage);
  const bookId = requireNonEmptyString(body.bookId);
  const interfaceLanguage = requireNonEmptyString(body.interfaceLanguage);
  const comment = trimOptionalText(body.comment);

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
      user_id: '',
      translation_id: translationId,
      translation_language: translationLanguage,
      interface_language: interfaceLanguage,
      content_language_code: trimOptionalText(body.contentLanguageCode),
      content_language_name: trimOptionalText(body.contentLanguageName),
      book_id: bookId,
      chapter: body.chapter,
      sentiment: body.sentiment,
      comment,
      source_screen: requireNonEmptyString(body.sourceScreen) ?? 'reader',
      app_platform: trimOptionalText(body.appPlatform),
      app_version: trimOptionalText(body.appVersion),
      export_status: 'pending',
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

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(401, { success: false, error: 'Missing bearer token' });
    }

    const accessToken = authorization.slice('Bearer '.length).trim();
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      return jsonResponse(401, { success: false, error: 'Not authenticated' });
    }

    const requestBody = (await req.json().catch(() => ({}))) as ChapterFeedbackRequest;
    const validation = validateRequest(requestBody);

    if (!validation.value) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    const insertPayload: ChapterFeedbackInsert = {
      ...validation.value,
      user_id: user.id,
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

    try {
      const spreadsheetId = getRequiredSecret('GOOGLE_SHEETS_SPREADSHEET_ID');
      const googleAccessToken = await createGoogleAccessToken();
      await appendSheetRow(googleAccessToken, spreadsheetId, feedbackRow);

      const exportedAt = new Date().toISOString();
      await supabase
        .from('chapter_feedback_submissions')
        .update({
          export_status: 'exported',
          exported_at: exportedAt,
          export_error: null,
        })
        .eq('id', feedbackRow.id);

      return jsonResponse(200, {
        success: true,
        saved: true,
        exported: true,
        feedbackId: feedbackRow.id,
      });
    } catch (exportError) {
      const exportMessage =
        exportError instanceof Error ? exportError.message : 'Unknown spreadsheet export failure';

      await supabase
        .from('chapter_feedback_submissions')
        .update({
          export_status: 'failed',
          export_error: exportMessage,
        })
        .eq('id', feedbackRow.id);

      return jsonResponse(200, {
        success: true,
        saved: true,
        exported: false,
        feedbackId: feedbackRow.id,
        error: exportMessage,
      });
    }
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      saved: false,
      exported: false,
      error: error instanceof Error ? error.message : 'Unknown submit-chapter-feedback error',
    });
  }
});
