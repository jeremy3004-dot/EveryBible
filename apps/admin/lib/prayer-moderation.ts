import { createAdminServiceClient } from '@/lib/supabase/service';

// Prayer wall moderation (App Store Guideline 1.2). Members report requests through the
// report_prayer_request RPC; the tables below are service-only and read here for the admin
// Reports page. Schema: supabase/migrations/20260924180000_prayer_wall_moderation.sql.

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

export async function getPrayerReportQueue(
  filter: PrayerReportQueueFilter
): Promise<{ items: ReportedPrayerRequest[]; bans: PrayerWallBan[] }> {
  const service = createAdminServiceClient();
  let reportsQuery = service
    .from('prayer_request_reports')
    .select(
      'id, request_id, reporter_id, request_author_id, group_id, content_snapshot, reason, note, status, created_at, reviewed_at'
    );
  if (filter === 'open') {
    reportsQuery = reportsQuery.eq('status', 'open');
  }
  const { data: reportData, error: reportsError } = await reportsQuery
    .order('created_at', { ascending: false })
    .limit(QUEUE_LIMIT);
  if (reportsError) {
    throw new Error(`Unable to load prayer reports: ${reportsError.message}`);
  }
  const reports = (reportData ?? []) as ReportRow[];
  const requestIds = [...new Set(reports.map((row) => row.request_id))];
  const groupIds = [...new Set(reports.map((row) => row.group_id))];

  const [requestsResult, bansResult, groupsResult] = await Promise.all([
    requestIds.length > 0
      ? service
          .from('prayer_requests')
          .select('id, group_id, user_id, content, hidden_at, hidden_reason, created_at')
          .in('id', requestIds)
      : Promise.resolve({ data: [], error: null }),
    service
      .from('prayer_wall_bans')
      .select('user_id, reason, created_at')
      .order('created_at', { ascending: false }),
    groupIds.length > 0
      ? service.from('groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [], error: null }),
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
  const bans = (bansResult.data ?? []) as BanRow[];

  return {
    items: groupPrayerReports({
      reports,
      requests: (requestsResult.data ?? []) as RequestRow[],
      bans,
      groups: (groupsResult.data ?? []) as GroupRow[],
    }),
    bans: bans.map((row) => ({
      userId: row.user_id,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}

export async function getPrayerFilterTerms(): Promise<PrayerFilterTerm[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('prayer_content_filter_terms')
    .select('id, term, match_mode, language, created_at')
    .order('language', { ascending: true, nullsFirst: false })
    .order('term', { ascending: true });
  if (error) {
    throw new Error(`Unable to load prayer filter terms: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: number;
      term: string;
      match_mode: 'word' | 'substring';
      language: string | null;
      created_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    term: row.term,
    matchMode: row.match_mode,
    language: row.language,
    createdAt: row.created_at,
  }));
}

/** Reads the add-term form. The database repeats these checks. */
export function parseFilterTermInput(
  formData: FormData
): { term: string; matchMode: 'word' | 'substring'; language: string | null } | { error: string } {
  const rawTerm = formData.get('term');
  const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';
  if (term.length < 1 || term.length > 100) {
    return { error: 'A term of 1 to 100 characters is required' };
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
