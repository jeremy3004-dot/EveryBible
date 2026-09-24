import type { SupabaseClient } from '@supabase/supabase-js';

import { getAuthorizedAdminServiceClient } from '@/lib/supabase/authorized-service';

// Prayer wall moderation (App Store Guideline 1.2). Members report requests through the
// report_prayer_request RPC; the tables below are service-only and read here for the admin
// Reports page. Schema: supabase/migrations/20260924045749_prayer_wall_moderation.sql.

/** English labels for the reasons the app offers (the RPC's CHECK constraint). */
export const PRAYER_REPORT_REASON_LABELS: Record<string, string> = {
  spam: 'Spam or advertising',
  abuse: 'Harassment or hate',
  sexual: 'Sexual content',
  harm: 'Violence or self-harm',
  other: 'Something else',
};

/** Open reports on this many different members hide a request until it is reviewed. */
export const PRAYER_REPORT_AUTO_HIDE_THRESHOLD = 3;

const QUEUE_LIMIT = 500;
// Ids per `in` filter. Each uuid adds about 37 bytes to the request URL, and a few hundred of
// them pass what the API gateway accepts.
const IN_FILTER_BATCH = 100;
// PostgREST returns at most max_rows (1000 by default) rows whatever the query asks for.
const PAGE_SIZE = 1000;
// A backstop so a runaway table cannot turn one page load into an unbounded scan.
const MAX_PAGED_ROWS = 50_000;

export type PrayerReportQueueFilter = 'open' | 'all';

interface ReportRow {
  id: string;
  request_id: string;
  reporter_id: string;
  request_author_id: string;
  group_id: string;
  content_snapshot: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

interface RequestRow {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

interface BanRow {
  user_id: string;
  reason: string | null;
  created_at: string;
}

interface GroupRow {
  id: string;
  name: string | null;
}

export interface PrayerReportEntry {
  id: string;
  reporterId: string;
  reason: string;
  reasonLabel: string;
  note: string | null;
  status: string;
  createdAt: string;
}

export interface ReportedPrayerRequest {
  requestId: string;
  groupId: string;
  groupName: string | null;
  authorId: string;
  authorBanned: boolean;
  /** The request as it reads now, or as reported when it no longer exists. */
  content: string;
  /** The text the newest report saw. */
  reportedContent: string;
  editedSinceReport: boolean;
  requestExists: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  openReportCount: number;
  latestReportAt: string;
  reports: PrayerReportEntry[];
}

export interface PrayerWallBan {
  userId: string;
  reason: string | null;
  createdAt: string;
}

export interface PrayerFilterTerm {
  id: number;
  term: string;
  matchMode: 'word' | 'substring';
  language: string | null;
  createdAt: string;
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

/** Reads every row `page` returns, one PostgREST page at a time. */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<QueryResult>
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_PAGED_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

/** Reads the rows whose id is in `ids`, a batch of ids per request. */
async function readByIds<T>(
  service: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += IN_FILTER_BATCH) {
    batches.push(ids.slice(index, index + IN_FILTER_BATCH));
  }
  const results = await Promise.all(
    batches.map((batch) => service.from(table).select(columns).in('id', batch))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { rows: [], error: failed.error };
  return { rows: results.flatMap((result) => (result.data ?? []) as T[]), error: null };
}

const newestFirst = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at.localeCompare(a.created_at);

/**
 * One entry per reported request, the most urgent first: most open reports, then the most
 * recently reported.
 */
export function groupPrayerReports({
  reports,
  requests,
  bans,
  groups,
}: {
  reports: ReportRow[];
  requests: RequestRow[];
  bans: BanRow[];
  groups: GroupRow[];
}): ReportedPrayerRequest[] {
  const requestById = new Map(requests.map((row) => [row.id, row]));
  const groupNameById = new Map(groups.map((row) => [row.id, row.name]));
  const bannedAuthors = new Set(bans.map((row) => row.user_id));
  const reportsByRequest = new Map<string, ReportRow[]>();
  for (const row of reports) {
    const list = reportsByRequest.get(row.request_id) ?? [];
    list.push(row);
    reportsByRequest.set(row.request_id, list);
  }

  const items = [...reportsByRequest.entries()].map(([requestId, rows]): ReportedPrayerRequest => {
    const sorted = [...rows].sort(newestFirst);
    const newest = sorted[0];
    const current = requestById.get(requestId);
    const content = current?.content ?? newest.content_snapshot;
    return {
      requestId,
      groupId: current?.group_id ?? newest.group_id,
      groupName: groupNameById.get(current?.group_id ?? newest.group_id) ?? null,
      authorId: current?.user_id ?? newest.request_author_id,
      authorBanned: bannedAuthors.has(current?.user_id ?? newest.request_author_id),
      content,
      reportedContent: newest.content_snapshot,
      editedSinceReport: content !== newest.content_snapshot,
      requestExists: Boolean(current),
      hiddenAt: current?.hidden_at ?? null,
      hiddenReason: current?.hidden_reason ?? null,
      openReportCount: rows.filter((row) => row.status === 'open').length,
      latestReportAt: newest.created_at,
      reports: sorted.map((row) => ({
        id: row.id,
        reporterId: row.reporter_id,
        reason: row.reason,
        reasonLabel: PRAYER_REPORT_REASON_LABELS[row.reason] ?? row.reason,
        note: row.note,
        status: row.status,
        createdAt: row.created_at,
      })),
    };
  });

  return items.sort(
    (a, b) =>
      b.openReportCount - a.openReportCount || b.latestReportAt.localeCompare(a.latestReportAt)
  );
}

export interface PrayerReportQueue {
  items: ReportedPrayerRequest[];
  bans: PrayerWallBan[];
  /** Reports matching the filter in the database. */
  reportTotal: number;
  /** Reports read for this page: the newest, up to the queue limit. */
  reportsShown: number;
  /** True when older reports were left out, so some requests may be missing. */
  truncated: boolean;
}

export async function getPrayerReportQueue(
  filter: PrayerReportQueueFilter
): Promise<PrayerReportQueue> {
  const service = await getAuthorizedAdminServiceClient();
  let reportsQuery = service
    .from('prayer_request_reports')
    .select(
      'id, request_id, reporter_id, request_author_id, group_id, content_snapshot, reason, note, status, created_at, reviewed_at',
      { count: 'exact' }
    );
  if (filter === 'open') {
    reportsQuery = reportsQuery.eq('status', 'open');
  }
  const {
    data: reportData,
    error: reportsError,
    count,
  } = await reportsQuery.order('created_at', { ascending: false }).limit(QUEUE_LIMIT);
  if (reportsError) {
    throw new Error(`Unable to load prayer reports: ${reportsError.message}`);
  }
  const reports = (reportData ?? []) as ReportRow[];
  const reportTotal = typeof count === 'number' ? Math.max(count, reports.length) : reports.length;
  const requestIds = [...new Set(reports.map((row) => row.request_id))];
  const groupIds = [...new Set(reports.map((row) => row.group_id))];

  const [requestsResult, bansResult, groupsResult] = await Promise.all([
    readByIds<RequestRow>(
      service,
      'prayer_requests',
      'id, group_id, user_id, content, hidden_at, hidden_reason, created_at',
      requestIds
    ),
    readAllPages<BanRow>((from, to) =>
      service
        .from('prayer_wall_bans')
        .select('user_id, reason, created_at')
        .order('created_at', { ascending: false })
        .order('user_id', { ascending: true })
        .range(from, to)
    ),
    readByIds<GroupRow>(service, 'groups', 'id, name', groupIds),
  ]);
  for (const [label, result] of [
    ['prayer requests', requestsResult],
    ['prayer wall bans', bansResult],
    ['groups', groupsResult],
  ] as const) {
    if (result.error) {
      throw new Error(`Unable to load ${label}: ${result.error.message}`);
    }
  }
  const bans = bansResult.rows;

  return {
    items: groupPrayerReports({
      reports,
      requests: requestsResult.rows,
      bans,
      groups: groupsResult.rows,
    }),
    bans: bans.map((row) => ({
      userId: row.user_id,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    reportTotal,
    reportsShown: reports.length,
    truncated: reportTotal > reports.length,
  };
}

export async function getPrayerFilterTerms(): Promise<PrayerFilterTerm[]> {
  const service = await getAuthorizedAdminServiceClient();
  const { rows, error } = await readAllPages<{
    id: number;
    term: string;
    match_mode: 'word' | 'substring';
    language: string | null;
    created_at: string;
  }>((from, to) =>
    service
      .from('prayer_content_filter_terms')
      .select('id, term, match_mode, language, created_at')
      .order('language', { ascending: true, nullsFirst: false })
      .order('term', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (error) {
    throw new Error(`Unable to load prayer filter terms: ${error.message}`);
  }

  return rows.map((row) => ({
    id: row.id,
    term: row.term,
    matchMode: row.match_mode,
    language: row.language,
    createdAt: row.created_at,
  }));
}

export const FILTER_TERM_MAX_LENGTH = 100;

/** Reads the add-term form. The database repeats these checks. */
export function parseFilterTermInput(
  formData: FormData
): { term: string; matchMode: 'word' | 'substring'; language: string | null } | { error: string } {
  const rawTerm = formData.get('term');
  const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';
  // Characters, not UTF-16 units, as Postgres's length() counts them.
  const length = Array.from(term).length;
  if (length < 1 || length > FILTER_TERM_MAX_LENGTH) {
    return { error: `A term of 1 to ${FILTER_TERM_MAX_LENGTH} characters is required` };
  }
  // Matching ignores spaces and punctuation, so a term needs something else to match on. The
  // database's CHECK constraint refuses it otherwise.
  if (!/[\p{L}\p{N}]/u.test(term)) {
    return { error: 'A term needs at least one letter or number' };
  }

  const rawMode = formData.get('matchMode');
  const matchMode = typeof rawMode === 'string' && rawMode.trim() ? rawMode.trim() : 'word';
  if (matchMode !== 'word' && matchMode !== 'substring') {
    return { error: 'Match mode must be word or substring' };
  }

  const rawLanguage = formData.get('language');
  const language =
    typeof rawLanguage === 'string' && rawLanguage.trim() ? rawLanguage.trim().toLowerCase() : null;
  if (language !== null && !/^[a-z]{2,3}$/.test(language)) {
    return { error: 'Language must be a 2 or 3 letter code, such as en or zh' };
  }

  return { term, matchMode, language };
}
