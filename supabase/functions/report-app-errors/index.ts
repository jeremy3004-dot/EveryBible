// Public, anonymous crash-report collector for the mobile app (verify_jwt = false).
//
// Privacy: the Authorization header is never read, no user is looked up, no geo lookup is
// made, and the source address is used only as a salted throttle key. Each report is
// re-validated and re-scrubbed in _shared/appErrorIngest.ts before it is stored in
// app_error_reports (service role only, purged after 90 days).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readBodyWithinLimit } from '../_shared/analyticsIngest.ts';
import {
  type AppErrorReportRow,
  consumeAppErrorBudget,
  hashAppErrorClientKey,
  MAX_APP_ERROR_BODY_BYTES,
  MAX_REPORTS_PER_REQUEST,
  normalizeAppErrorReport,
} from '../_shared/appErrorIngest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'retry-after',
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers },
    status,
  });
}

// Database and configuration details go to the function log, never into the response.
function internalErrorResponse(context: string, detail: unknown): Response {
  console.error(`[report-app-errors] ${context}`, detail);
  return jsonResponse({ error: 'Unable to record error reports right now.' }, 500);
}

function parseReports(text: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const reports = (parsed as { reports?: unknown } | null)?.reports;
  if (!Array.isArray(reports) || reports.length === 0 || reports.length > MAX_REPORTS_PER_REQUEST) {
    return null;
  }
  return reports;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse({ ok: true, service: 'report-app-errors' });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return internalErrorResponse(
        'missing configuration',
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set'
      );
    }

    const body = await readBodyWithinLimit(request, MAX_APP_ERROR_BODY_BYTES);
    if (!body.ok) return jsonResponse({ error: 'Request body is too large' }, 413);
    const reports = parseReports(body.text);
    if (!reports) return jsonResponse({ error: 'Request body must include 1-20 reports' }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const clientKey = await hashAppErrorClientKey(request, serviceRoleKey);
    const budget = await consumeAppErrorBudget(supabase, clientKey, {
      reports: reports.length,
      bytes: body.bytes,
    });
    if (budget.unavailable) {
      console.warn('[report-app-errors] ingest limiter unavailable; refusing writes');
      return jsonResponse({ error: 'Error reporting is temporarily unavailable' }, 503, {
        'Retry-After': String(budget.retryAfterSeconds),
      });
    }
    if (!budget.allowed) {
      return jsonResponse({ error: 'Too many error reports; retry later' }, 429, {
        'Retry-After': String(budget.retryAfterSeconds),
      });
    }

    // Bad reports are dropped one by one rather than failing the batch, so one malformed
    // entry cannot make the device retry the whole queue forever.
    const rows: AppErrorReportRow[] = [];
    let rejected = 0;
    for (const report of reports) {
      const row = await normalizeAppErrorReport(report);
      if (typeof row === 'string') rejected += 1;
      else rows.push(row);
    }
    if (rows.length === 0) return jsonResponse({ ok: true, inserted: 0, rejected });

    const { error } = await supabase
      .from('app_error_reports')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) return internalErrorResponse('app_error_reports write failed', error);

    return jsonResponse({ ok: true, inserted: rows.length, rejected });
  } catch (error) {
    return internalErrorResponse('unhandled error', error);
  }
});
