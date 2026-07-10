import { adminNavigation } from '@/lib/admin-navigation';
import {
  type CountryMetric,
  type CountryMetricRollup,
  type DailyMetricPoint,
  type LocationMetricRollup,
  type TranslationBreakdownEntry,
  type TranslationCountryRollup,
  type TranslationLocationRollup,
  type TranslationListeningRollup,
  type TranslationListenerRollup,
  buildTranslationBreakdown,
  mapCountryRollupsToMetrics,
  mapLocationRollupsToMetrics,
} from '@/lib/analytics-reporting';
import { createAdminServiceClient } from '@/lib/supabase/service';

interface TranslationCatalogRow {
  abbreviation: string;
  admin_notes: string | null;
  distribution_state: 'draft' | 'ready' | 'published' | 'hidden';
  has_audio: boolean;
  has_text: boolean;
  is_available: boolean;
  language_name: string;
  name: string;
  translation_id: string;
  updated_at: string;
  upstream_last_synced_at: string | null;
  upstream_payload: Record<string, unknown> | null;
}

interface TranslationVersionRow {
  data_checksum: string | null;
  id: string;
  is_current: boolean;
  published_at: string;
  total_books: number | null;
  total_chapters: number | null;
  total_verses: number | null;
  translation_id: string;
  version_number: number;
}

interface SyncRunRow {
  failed_count: number;
  finished_at: string | null;
  id: string;
  inserted_count: number;
  message: string | null;
  started_at: string;
  state: 'idle' | 'running' | 'succeeded' | 'failed';
  triggered_by: string | null;
  updated_count: number;
}

interface ContentImageRow {
  alt_text: string;
  caption: string | null;
  ends_at: string | null;
  id: string;
  kind: 'hero' | 'verse_of_day' | 'promo' | 'feature' | 'social';
  public_url: string;
  starts_at: string | null;
  state: 'draft' | 'scheduled' | 'live' | 'archived';
  title: string;
  updated_at: string;
}

interface ProfileRow {
  admin_role: string | null;
  created_at: string;
  display_name: string | null;
  email: string | null;
  id: string;
  updated_at: string;
}

interface UserPreferencesRow {
  content_language_name: string | null;
  country_code: string | null;
  country_name: string | null;
  language: string;
  synced_at: string | null;
  theme: string;
  user_id: string;
}

interface UserProgressRow {
  current_book: string | null;
  current_chapter: number | null;
  last_read_date: string | null;
  streak_days: number;
  user_id: string;
}

interface UserDeviceRow {
  app_version: string | null;
  created_at: string;
  id: string;
  is_active: boolean;
  platform: string;
  push_token: string;
  user_id: string;
}

interface UserEngagementRow {
  engagement_score: number;
  last_active_date: string | null;
  total_chapters_read: number;
  total_listening_minutes: number;
  total_sessions: number;
  user_id: string;
}

interface AuditLogRow {
  action: string;
  actor_email: string | null;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  id: string;
  metadata?: Record<string, unknown> | null;
  summary: string;
}

interface ChapterFeedbackRow {
  app_platform: string | null;
  app_version: string | null;
  audio_response_bucket: string | null;
  audio_response_created_at: string | null;
  audio_response_duration_ms: number | null;
  audio_response_mime_type: string | null;
  audio_response_path: string | null;
  audio_response_size_bytes: number | null;
  book_id: string;
  chapter: number;
  comment: string | null;
  content_language_code: string | null;
  content_language_name: string | null;
  created_at: string;
  id: string;
  interface_language: string;
  participant_name: string | null;
  participant_role: string | null;
  sentiment: 'up' | 'down';
  source_screen: string;
  scripture_council_fixed_at: string | null;
  scripture_council_fixed_by: string | null;
  scripture_council_fixed_note: string | null;
  translation_id: string;
  translation_language: string;
  user_id: string | null;
}

type ChapterFeedbackSentiment = 'up' | 'down';
type ChapterFeedbackResponseType = 'audio' | 'text';
type ChapterFeedbackFixStatus = 'open' | 'fixed';

export interface DashboardSummary {
  adminPathCount: number;
  failedSyncCount: number;
  feedbackCount: number;
  liveImageCount: number;
  liveVerseCount: number;
  supportUserCount: number;
  translationCount: number;
}

export interface TranslationListItem {
  abbreviation: string;
  adminNotes: string | null;
  currentVersion: number | null;
  distributionState: 'draft' | 'ready' | 'published' | 'hidden';
  hasAudio: boolean;
  hasText: boolean;
  isAvailable: boolean;
  languageName: string;
  name: string;
  translationId: string;
  updatedAt: string;
  upstreamLastSyncedAt: string | null;
}

export interface TranslationDetail extends TranslationListItem {
  recentRuns: SyncRunRow[];
  upstreamPayload: Record<string, unknown> | null;
  versions: TranslationVersionRow[];
}

export interface VerseOfDayListItem {
  bookId: string | null;
  chapter: number | null;
  createdAt: string;
  endsAt: string | null;
  id: string;
  imageId: string | null;
  referenceLabel: string;
  reflection: string | null;
  startsAt: string | null;
  state: 'draft' | 'scheduled' | 'live' | 'archived';
  title: string | null;
  translationId: string;
  updatedAt: string;
  verse: number | null;
  verseText: string;
}

export interface HealthIssue {
  description: string;
  href: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
}

export interface SupportUserSummary {
  countryName: string | null;
  createdAt: string;
  currentBook: string | null;
  currentChapter: number | null;
  deviceCount: number;
  displayName: string | null;
  email: string | null;
  engagementScore: number;
  id: string;
  lastActiveDate: string | null;
  streakDays: number;
}

export interface SupportUserDetail {
  devices: UserDeviceRow[];
  engagement: UserEngagementRow | null;
  feedbackCount: number;
  planCount: number;
  preferences: UserPreferencesRow | null;
  profile: ProfileRow | null;
  progress: UserProgressRow | null;
  recentAuditLogs: AuditLogRow[];
  sessionCount: number;
}

export interface ChapterFeedbackListItem {
  appLabel: string;
  audioResponse: {
    createdAt: string | null;
    durationMs: number;
    mimeType: string;
    path: string;
    signedUrl: string | null;
    sizeBytes: number | null;
  } | null;
  bookId: string;
  chapter: number;
  comment: string | null;
  contentLanguage: string | null;
  createdAt: string;
  id: string;
  interfaceLanguage: string;
  participantLabel: string;
  // Resolved from the reviewer's profile (display name → email local-part), so
  // the UI shows a human name instead of a raw UUID. Null when unresolvable.
  reviewerDisplayName: string | null;
  scriptureCouncilFix: {
    fixedAt: string;
    fixedBy: string | null;
    note: string | null;
  } | null;
  sentiment: 'up' | 'down';
  sourceScreen: string;
  translationId: string;
  translationLanguage: string;
  userId: string | null;
}

export interface ChapterFeedbackFilters {
  bookId?: string;
  chapter?: number;
  fixStatus?: ChapterFeedbackFixStatus;
  language?: string;
  query?: string;
  responseType?: ChapterFeedbackResponseType;
  sentiment?: ChapterFeedbackSentiment;
  translationId?: string;
  // Default true — excludes QA/smoke-test submissions ("Test church" reviewers
  // and @example.com accounts) so production feedback isn't polluted by them.
  hideTestData?: boolean;
}

export interface ChapterFeedbackFilterOption {
  count: number;
  label: string;
  value: string;
}

export interface ChapterFeedbackCoverageItem {
  audioCount: number;
  bookCount: number;
  chapterCount: number;
  language: string;
  latestAt: string;
  submissionCount: number;
}

export interface ChapterFeedbackTranslationCoverageItem {
  fixedCount: number;
  language: string;
  latestAt: string;
  openCouncilFixCount: number;
  submissionCount: number;
  translationId: string;
}

export interface ChapterFeedbackReviewModel {
  coverage: ChapterFeedbackCoverageItem[];
  feedback: ChapterFeedbackListItem[];
  filters: {
    books: ChapterFeedbackFilterOption[];
    languages: ChapterFeedbackFilterOption[];
    translations: ChapterFeedbackFilterOption[];
  };
  translationCoverage: ChapterFeedbackTranslationCoverageItem[];
  totalAvailable: number;
}

export interface AnalyticsOverview {
  activeCountryCount: number;
  activeLocationCount: number;
  averageEngagementScore: number;
  // When the nightly cron last recomputed engagement scores (ISO), or null.
  engagementScoreComputedAt: string | null;
  countryMetrics: CountryMetric[];
  dailyDownloadUnits: DailyMetricPoint[];
  dailyListeningMinutes: Array<{ day: string; minutes: number }>;
  dailyReadingMinutes: Array<{ day: string; minutes: number }>;
  listeningTotalMinutes: number;
  // Authoritative distinct listeners that resolved to a map location (Phase 1).
  // Always <= userCountWithListening. Replaces the old client-summed 377.
  locatedListenerCount: number;
  locationMetrics: CountryMetric[];
  readingTotalMinutes: number;
  totalDownloadUnits: number;
  totalTrackedSessions: number;
  translationBreakdown: TranslationBreakdownEntry[];
  userCountWithListening: number;
}

interface AnalyticsOverviewRpcPayload {
  activeCountryCount?: number;
  activeLocationCount?: number;
  averageEngagementScore?: number;
  countryMetrics?: CountryMetricRollup[];
  dailyDownloadUnits?: DailyMetricPoint[];
  dailyListeningMinutes?: DailyMetricPoint[];
  dailyReadingMinutes?: DailyMetricPoint[];
  listeningTotalMinutes?: number;
  locatedListenerCount?: number;
  locationMetrics?: LocationMetricRollup[];
  readingTotalMinutes?: number;
  totalDownloadUnits?: number;
  totalTrackedSessions?: number;
  translationCountryMetrics?: TranslationCountryRollup[];
  translationLocationMetrics?: TranslationLocationRollup[];
  translationListeningMinutes?: TranslationListeningRollup[];
  translationListenerCounts?: TranslationListenerRollup[];
  userCountWithListening?: number;
}

function isWithinWindow(startsAt: string | null, endsAt: string | null, now = Date.now()): boolean {
  const startsOk = !startsAt || new Date(startsAt).getTime() <= now;
  const endsOk = !endsAt || new Date(endsAt).getTime() >= now;
  return startsOk && endsOk;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const service = createAdminServiceClient();

  const [translations, failedSyncs, liveVerses, liveImages, supportUsers, feedback] =
    await Promise.all([
      service.from('translation_catalog').select('translation_id', { count: 'exact', head: true }),
      service
        .from('translation_sync_runs')
        .select('id', { count: 'exact', head: true })
        .eq('state', 'failed'),
      service.from('verse_of_day_entries').select('id, starts_at, ends_at, state'),
      service.from('content_images').select('id, starts_at, ends_at, state'),
      service.from('profiles').select('id', { count: 'exact', head: true }),
      service.from('chapter_feedback_submissions').select('id', { count: 'exact', head: true }),
    ]);

  const liveVerseCount = (liveVerses.data ?? []).filter((item) => {
    return item.state === 'live' && isWithinWindow(item.starts_at, item.ends_at);
  }).length;

  const liveImageCount = (liveImages.data ?? []).filter((item) => {
    return item.state === 'live' && isWithinWindow(item.starts_at, item.ends_at);
  }).length;

  return {
    adminPathCount: adminNavigation.length,
    failedSyncCount: failedSyncs.count ?? 0,
    feedbackCount: feedback.count ?? 0,
    liveImageCount,
    liveVerseCount,
    supportUserCount: supportUsers.count ?? 0,
    translationCount: translations.count ?? 0,
  };
}

export async function getRecentAuditLogs(limit = 12): Promise<AuditLogRow[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('admin_audit_logs')
    .select('id, action, actor_email, entity_type, entity_id, metadata, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load audit logs: ${error.message}`);
  }

  return (data ?? []) as AuditLogRow[];
}

export async function listTranslations(searchTerm?: string): Promise<TranslationListItem[]> {
  const service = createAdminServiceClient();
  let query = service
    .from('translation_catalog')
    .select(
      'translation_id, name, abbreviation, language_name, has_text, has_audio, is_available, distribution_state, admin_notes, updated_at, upstream_last_synced_at'
    )
    .order('language_name', { ascending: true })
    .order('name', { ascending: true });

  if (searchTerm && searchTerm.trim().length > 0) {
    const term = searchTerm.trim();
    query = query.or(
      `translation_id.ilike.%${term}%,name.ilike.%${term}%,abbreviation.ilike.%${term}%,language_name.ilike.%${term}%`
    );
  }

  const [{ data: catalog, error: catalogError }, { data: versions, error: versionsError }] =
    await Promise.all([
      query,
      service
        .from('translation_versions')
        .select('translation_id, version_number, is_current')
        .eq('is_current', true),
    ]);

  if (catalogError) {
    throw new Error(`Unable to load translation catalog: ${catalogError.message}`);
  }

  if (versionsError) {
    throw new Error(`Unable to load translation versions: ${versionsError.message}`);
  }

  const currentVersionByTranslation = new Map(
    (versions ?? []).map((row) => [row.translation_id as string, row.version_number as number])
  );

  return ((catalog as TranslationCatalogRow[] | null) ?? []).map((row) => ({
    abbreviation: row.abbreviation,
    adminNotes: row.admin_notes,
    currentVersion: currentVersionByTranslation.get(row.translation_id) ?? null,
    distributionState: row.distribution_state,
    hasAudio: row.has_audio,
    hasText: row.has_text,
    isAvailable: row.is_available,
    languageName: row.language_name,
    name: row.name,
    translationId: row.translation_id,
    updatedAt: row.updated_at,
    upstreamLastSyncedAt: row.upstream_last_synced_at,
  }));
}

export async function getTranslationDetail(
  translationId: string
): Promise<TranslationDetail | null> {
  const service = createAdminServiceClient();
  const [{ data: catalog, error: catalogError }, { data: versions, error: versionsError }] =
    await Promise.all([
      service
        .from('translation_catalog')
        .select(
          'translation_id, name, abbreviation, language_name, has_text, has_audio, is_available, distribution_state, admin_notes, updated_at, upstream_last_synced_at, upstream_payload'
        )
        .eq('translation_id', translationId)
        .maybeSingle<TranslationCatalogRow>(),
      service
        .from('translation_versions')
        .select(
          'id, translation_id, version_number, is_current, published_at, total_books, total_chapters, total_verses, data_checksum'
        )
        .eq('translation_id', translationId)
        .order('version_number', { ascending: false }),
    ]);

  if (catalogError) {
    throw new Error(`Unable to load translation detail: ${catalogError.message}`);
  }

  if (versionsError) {
    throw new Error(`Unable to load translation versions: ${versionsError.message}`);
  }

  if (!catalog) {
    return null;
  }

  const currentVersion = (versions ?? []).find((row) => row.is_current)?.version_number ?? null;

  const { data: runs, error: runsError } = await service
    .from('translation_sync_runs')
    .select(
      'id, state, started_at, finished_at, inserted_count, updated_count, failed_count, message, triggered_by'
    )
    .order('started_at', { ascending: false })
    .limit(6);

  if (runsError) {
    throw new Error(`Unable to load sync runs: ${runsError.message}`);
  }

  return {
    abbreviation: catalog.abbreviation,
    adminNotes: catalog.admin_notes,
    currentVersion,
    distributionState: catalog.distribution_state,
    hasAudio: catalog.has_audio,
    hasText: catalog.has_text,
    isAvailable: catalog.is_available,
    languageName: catalog.language_name,
    name: catalog.name,
    recentRuns: (runs ?? []) as SyncRunRow[],
    translationId: catalog.translation_id,
    updatedAt: catalog.updated_at,
    upstreamLastSyncedAt: catalog.upstream_last_synced_at,
    upstreamPayload: catalog.upstream_payload,
    versions: (versions ?? []) as TranslationVersionRow[],
  };
}

export async function listSyncRuns(limit = 10): Promise<SyncRunRow[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('translation_sync_runs')
    .select(
      'id, state, started_at, finished_at, inserted_count, updated_count, failed_count, message, triggered_by'
    )
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load sync runs: ${error.message}`);
  }

  return (data ?? []) as SyncRunRow[];
}

const chapterFeedbackSelectColumns = [
  'id',
  'user_id',
  'translation_id',
  'translation_language',
  'interface_language',
  'content_language_code',
  'content_language_name',
  'participant_name',
  'participant_role',
  'audio_response_bucket',
  'audio_response_path',
  'audio_response_mime_type',
  'audio_response_size_bytes',
  'audio_response_duration_ms',
  'audio_response_created_at',
  'book_id',
  'chapter',
  'sentiment',
  'comment',
  'scripture_council_fixed_at',
  'scripture_council_fixed_by',
  'scripture_council_fixed_note',
  'source_screen',
  'app_platform',
  'app_version',
  'created_at',
].join(', ');

function normalizeChapterFeedbackFilters(
  filtersOrSearchTerm?: ChapterFeedbackFilters | string
): ChapterFeedbackFilters {
  if (typeof filtersOrSearchTerm === 'string') {
    return { query: filtersOrSearchTerm };
  }

  return filtersOrSearchTerm ?? {};
}

function countOption(map: Map<string, ChapterFeedbackFilterOption>, value: string, label = value) {
  const existing = map.get(value);
  if (existing) {
    existing.count += 1;
    return;
  }

  map.set(value, { count: 1, label, value });
}

function byCountThenLabel(a: ChapterFeedbackFilterOption, b: ChapterFeedbackFilterOption) {
  return b.count - a.count || a.label.localeCompare(b.label);
}

function mapChapterFeedbackRows(
  rows: ChapterFeedbackRow[],
  signedAudioUrls: Array<string | null>,
  reviewerProfiles: Map<string, { name: string | null; email: string | null }> = new Map()
): ChapterFeedbackListItem[] {
  return rows.map((row, index) => ({
    appLabel: [row.app_platform, row.app_version].filter(Boolean).join(' ') || 'Unknown app',
    audioResponse:
      row.audio_response_path && row.audio_response_duration_ms && row.audio_response_mime_type
        ? {
            createdAt: row.audio_response_created_at,
            durationMs: row.audio_response_duration_ms,
            mimeType: row.audio_response_mime_type,
            path: row.audio_response_path,
            signedUrl: signedAudioUrls[index] ?? null,
            sizeBytes: row.audio_response_size_bytes,
          }
        : null,
    bookId: row.book_id,
    chapter: row.chapter,
    comment: row.comment,
    contentLanguage: row.content_language_name ?? row.content_language_code,
    createdAt: row.created_at,
    id: row.id,
    interfaceLanguage: row.interface_language,
    participantLabel:
      [row.participant_name, row.participant_role].filter(Boolean).join(' / ') ||
      'Unknown reviewer',
    reviewerDisplayName: (() => {
      const profile = row.user_id ? reviewerProfiles.get(row.user_id) : undefined;
      if (profile?.name && profile.name.trim().length > 0) return profile.name.trim();
      if (profile?.email) return profile.email.split('@')[0] ?? null;
      return null;
    })(),
    scriptureCouncilFix: row.scripture_council_fixed_at
      ? {
          fixedAt: row.scripture_council_fixed_at,
          fixedBy: row.scripture_council_fixed_by,
          note: row.scripture_council_fixed_note,
        }
      : null,
    sentiment: row.sentiment,
    sourceScreen: row.source_screen,
    translationId: row.translation_id,
    translationLanguage: row.translation_language,
    userId: row.user_id,
  }));
}

async function signChapterFeedbackAudioRows(rows: ChapterFeedbackRow[]): Promise<Array<string | null>> {
  const service = createAdminServiceClient();

  return Promise.all(
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
}

export async function listChapterFeedback(
  filtersOrSearchTerm?: ChapterFeedbackFilters | string
): Promise<ChapterFeedbackListItem[]> {
  const service = createAdminServiceClient();
  const filters = normalizeChapterFeedbackFilters(filtersOrSearchTerm);
  let query = service
    .from('chapter_feedback_submissions')
    .select(chapterFeedbackSelectColumns)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.language) {
    query = query.eq('translation_language', filters.language);
  }

  if (filters.translationId) {
    query = query.eq('translation_id', filters.translationId);
  }

  if (filters.bookId) {
    query = query.eq('book_id', filters.bookId.toUpperCase());
  }

  if (filters.chapter && Number.isInteger(filters.chapter) && filters.chapter > 0) {
    query = query.eq('chapter', filters.chapter);
  }

  if (filters.sentiment) {
    query = query.eq('sentiment', filters.sentiment);
  }

  if (filters.fixStatus === 'open') {
    query = query.eq('sentiment', 'down').is('scripture_council_fixed_at', null);
  } else if (filters.fixStatus === 'fixed') {
    query = query.not('scripture_council_fixed_at', 'is', null);
  }

  if (filters.responseType === 'audio') {
    query = query.not('audio_response_path', 'is', null);
  } else if (filters.responseType === 'text') {
    query = query.not('comment', 'is', null);
  }

  if (filters.query && filters.query.trim().length > 0) {
    const term = filters.query.trim().replaceAll(',', ' ');
    query = query.or(
      `translation_id.ilike.%${term}%,translation_language.ilike.%${term}%,book_id.ilike.%${term}%,participant_name.ilike.%${term}%,participant_role.ilike.%${term}%,comment.ilike.%${term}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load chapter feedback: ${error.message}`);
  }

  const allRows = (data ?? []) as unknown as ChapterFeedbackRow[];

  // Resolve reviewer identities (name + email) from profiles so the UI can show
  // a human name instead of a raw UUID, and so we can exclude test accounts.
  const reviewerIds = Array.from(
    new Set(allRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))
  );
  const reviewerProfiles = new Map<string, { name: string | null; email: string | null }>();
  if (reviewerIds.length > 0) {
    const { data: profileRows } = await service
      .from('profiles')
      .select('id, display_name, email')
      .in('id', reviewerIds);
    for (const profile of profileRows ?? []) {
      reviewerProfiles.set(profile.id as string, {
        name: (profile.display_name as string | null) ?? null,
        email: (profile.email as string | null) ?? null,
      });
    }
  }

  const hideTestData = filters.hideTestData !== false;
  const rows = hideTestData
    ? allRows.filter((row) => {
        const email = (row.user_id ? reviewerProfiles.get(row.user_id)?.email : '') ?? '';
        const roleName = `${row.participant_name ?? ''} ${row.participant_role ?? ''}`
          .trim()
          .toLowerCase();
        const looksLikeTest =
          email.toLowerCase().endsWith('@example.com') ||
          roleName.includes('test church') ||
          roleName === 'test';
        return !looksLikeTest;
      })
    : allRows;

  const signedAudioUrls = await signChapterFeedbackAudioRows(rows);

  return mapChapterFeedbackRows(rows, signedAudioUrls, reviewerProfiles);
}

export async function getChapterFeedbackReviewModel(
  filters: ChapterFeedbackFilters = {}
): Promise<ChapterFeedbackReviewModel> {
  const service = createAdminServiceClient();
  const [feedback, optionRowsResult] = await Promise.all([
    listChapterFeedback(filters),
    service
      .from('chapter_feedback_submissions')
      .select(
        'translation_language, translation_id, content_language_name, content_language_code, book_id, chapter, sentiment, audio_response_path, scripture_council_fixed_at, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  if (optionRowsResult.error) {
    throw new Error(`Unable to load chapter feedback filters: ${optionRowsResult.error.message}`);
  }

  const languageOptions = new Map<string, ChapterFeedbackFilterOption>();
  const translationOptions = new Map<string, ChapterFeedbackFilterOption>();
  const bookOptions = new Map<string, ChapterFeedbackFilterOption>();
  const coverageByTranslation = new Map<
    string,
    {
      fixedCount: number;
      language: string;
      latestAt: string;
      openCouncilFixCount: number;
      submissionCount: number;
      translationId: string;
    }
  >();
  const coverageByLanguage = new Map<
    string,
    {
      audioCount: number;
      books: Set<string>;
      chapters: Set<string>;
      latestAt: string;
      submissionCount: number;
    }
  >();

  for (const row of optionRowsResult.data ?? []) {
    countOption(languageOptions, row.translation_language, row.translation_language);
    countOption(translationOptions, row.translation_id, row.translation_id);
    countOption(bookOptions, row.book_id, row.book_id);

    const coverage = coverageByLanguage.get(row.translation_language) ?? {
      audioCount: 0,
      books: new Set<string>(),
      chapters: new Set<string>(),
      latestAt: row.created_at,
      submissionCount: 0,
    };

    coverage.books.add(row.book_id);
    coverage.chapters.add(`${row.book_id} ${row.chapter}`);
    coverage.submissionCount += 1;
    coverage.latestAt = coverage.latestAt > row.created_at ? coverage.latestAt : row.created_at;
    if (row.audio_response_path) {
      coverage.audioCount += 1;
    }
    coverageByLanguage.set(row.translation_language, coverage);

    const translationCoverage = coverageByTranslation.get(row.translation_id) ?? {
      fixedCount: 0,
      language: row.translation_language,
      latestAt: row.created_at,
      openCouncilFixCount: 0,
      submissionCount: 0,
      translationId: row.translation_id,
    };
    translationCoverage.submissionCount += 1;
    translationCoverage.latestAt =
      translationCoverage.latestAt > row.created_at ? translationCoverage.latestAt : row.created_at;
    if (row.scripture_council_fixed_at) {
      translationCoverage.fixedCount += 1;
    } else if (row.sentiment === 'down') {
      translationCoverage.openCouncilFixCount += 1;
    }
    coverageByTranslation.set(row.translation_id, translationCoverage);
  }

  return {
    coverage: Array.from(coverageByLanguage.entries())
      .map(([language, coverage]) => ({
        audioCount: coverage.audioCount,
        bookCount: coverage.books.size,
        chapterCount: coverage.chapters.size,
        language,
        latestAt: coverage.latestAt,
        submissionCount: coverage.submissionCount,
      }))
      .sort((a, b) => b.submissionCount - a.submissionCount || a.language.localeCompare(b.language))
      .slice(0, 12),
    feedback,
    filters: {
      books: Array.from(bookOptions.values()).sort(byCountThenLabel),
      languages: Array.from(languageOptions.values()).sort(byCountThenLabel),
      translations: Array.from(translationOptions.values()).sort(byCountThenLabel),
    },
    translationCoverage: Array.from(coverageByTranslation.values())
      .sort(
        (a, b) =>
          b.openCouncilFixCount - a.openCouncilFixCount ||
          b.submissionCount - a.submissionCount ||
          a.translationId.localeCompare(b.translationId)
      )
      .slice(0, 12),
    totalAvailable: optionRowsResult.data?.length ?? 0,
  };
}

export async function listVerseOfDayEntries(): Promise<VerseOfDayListItem[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('verse_of_day_entries')
    .select(
      'id, title, translation_id, book_id, chapter, verse, reference_label, verse_text, reflection, state, starts_at, ends_at, created_at, updated_at, image_id'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load verse-of-day entries: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    bookId: (row.book_id as string | null) ?? null,
    chapter: (row.chapter as number | null) ?? null,
    createdAt: row.created_at as string,
    endsAt: (row.ends_at as string | null) ?? null,
    id: row.id as string,
    imageId: (row.image_id as string | null) ?? null,
    referenceLabel: row.reference_label as string,
    reflection: row.reflection as string | null,
    startsAt: row.starts_at as string | null,
    state: row.state as VerseOfDayListItem['state'],
    title: row.title as string | null,
    translationId: row.translation_id as string,
    updatedAt: row.updated_at as string,
    verse: (row.verse as number | null) ?? null,
    verseText: row.verse_text as string,
  }));
}

export async function listContentImages(): Promise<ContentImageRow[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('content_images')
    .select(
      'id, title, kind, state, alt_text, caption, public_url, starts_at, ends_at, updated_at'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load content images: ${error.message}`);
  }

  return (data ?? []) as ContentImageRow[];
}

export async function getHealthIssues(): Promise<HealthIssue[]> {
  const service = createAdminServiceClient();
  const issues: HealthIssue[] = [];
  const now = Date.now();

  const [syncRuns, verses, images, translations] = await Promise.all([
    listSyncRuns(12),
    service.from('verse_of_day_entries').select('id, state, starts_at, ends_at'),
    service.from('content_images').select('id, title, state, starts_at, ends_at, public_url'),
    service
      .from('translation_catalog')
      .select('translation_id, distribution_state, is_available, upstream_last_synced_at'),
  ]);

  const latestSuccessfulSync = syncRuns.find((run) => run.state === 'succeeded');
  if (!latestSuccessfulSync) {
    issues.push({
      description: 'No successful upstream translation sync has been recorded yet.',
      href: '/translations',
      severity: 'critical',
      title: 'No successful translation sync',
    });
  } else if (new Date(latestSuccessfulSync.started_at).getTime() < now - 1000 * 60 * 60 * 24) {
    issues.push({
      description: 'The latest successful sync is more than 24 hours old.',
      href: '/translations',
      severity: 'warning',
      title: 'Translation sync is stale',
    });
  }

  const liveVerseCount = (verses.data ?? []).filter((row) => {
    return (
      row.state === 'live' &&
      isWithinWindow(row.starts_at as string | null, row.ends_at as string | null)
    );
  }).length;

  if (liveVerseCount === 0) {
    issues.push({
      description: 'There is no live verse-of-the-day entry available right now.',
      href: '/content/verse-of-day',
      severity: 'critical',
      title: 'Verse of the Day is empty',
    });
  }

  const brokenImage = (images.data ?? []).find((row) => {
    return (
      row.state === 'live' &&
      (!row.public_url ||
        !isWithinWindow(row.starts_at as string | null, row.ends_at as string | null))
    );
  });

  if (brokenImage) {
    issues.push({
      description: `The live image "${brokenImage.title as string}" is missing a valid delivery window or URL.`,
      href: '/content/images',
      severity: 'warning',
      title: 'Live image needs attention',
    });
  }

  const hiddenPublishedTranslations = (translations.data ?? []).filter((row) => {
    return row.distribution_state === 'published' && row.is_available === false;
  });

  if (hiddenPublishedTranslations.length > 0) {
    issues.push({
      description:
        'Some translations are marked published while also hidden from the public catalog.',
      href: '/translations',
      severity: 'info',
      title: 'Published translations are hidden',
    });
  }

  if (issues.length === 0) {
    issues.push({
      description: 'All tracked translation, content, and readiness checks are green.',
      href: '/health',
      severity: 'info',
      title: 'No active health issues',
    });
  }

  return issues;
}

export async function listSupportUsers(queryText?: string): Promise<SupportUserSummary[]> {
  const service = createAdminServiceClient();
  let profileQuery = service
    .from('profiles')
    .select('id, email, display_name, created_at, admin_role')
    .order('created_at', { ascending: false })
    .limit(100);

  if (queryText && queryText.trim().length > 0) {
    const term = queryText.trim();
    profileQuery = profileQuery.or(`email.ilike.%${term}%,display_name.ilike.%${term}%`);
  }

  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) {
    throw new Error(`Unable to load users: ${profilesError.message}`);
  }

  const userIds = (profiles ?? []).map((profile) => profile.id as string);
  if (userIds.length === 0) {
    return [];
  }

  const [preferences, progress, devices, engagement] = await Promise.all([
    service.from('user_preferences').select('user_id, country_name').in('user_id', userIds),
    service
      .from('user_progress')
      .select('user_id, current_book, current_chapter, streak_days, last_read_date')
      .in('user_id', userIds),
    service.from('user_devices').select('user_id').in('user_id', userIds),
    service
      .from('user_engagement_summary')
      .select('user_id, engagement_score, last_active_date')
      .in('user_id', userIds),
  ]);

  const preferenceByUser = new Map(
    (preferences.data ?? []).map((row) => [row.user_id as string, row as UserPreferencesRow])
  );
  const progressByUser = new Map(
    (progress.data ?? []).map((row) => [row.user_id as string, row as UserProgressRow])
  );
  const engagementByUser = new Map(
    (engagement.data ?? []).map((row) => [row.user_id as string, row as UserEngagementRow])
  );
  const deviceCountByUser = new Map<string, number>();

  for (const row of devices.data ?? []) {
    const userId = row.user_id as string;
    deviceCountByUser.set(userId, (deviceCountByUser.get(userId) ?? 0) + 1);
  }

  return (profiles ?? []).map((profile) => {
    const profileRow = profile as ProfileRow;
    const preference = preferenceByUser.get(profileRow.id);
    const userProgress = progressByUser.get(profileRow.id);
    const userEngagement = engagementByUser.get(profileRow.id);

    return {
      countryName: preference?.country_name ?? null,
      createdAt: profileRow.created_at,
      currentBook: userProgress?.current_book ?? null,
      currentChapter: userProgress?.current_chapter ?? null,
      deviceCount: deviceCountByUser.get(profileRow.id) ?? 0,
      displayName: profileRow.display_name,
      email: profileRow.email,
      engagementScore: userEngagement?.engagement_score ?? 0,
      id: profileRow.id,
      lastActiveDate: userEngagement?.last_active_date ?? null,
      streakDays: userProgress?.streak_days ?? 0,
    };
  });
}

export async function getSupportUserDetail(userId: string): Promise<SupportUserDetail | null> {
  const service = createAdminServiceClient();
  const [profile, preferences, progress, devices, engagement, plans, feedback, events, audits] =
    await Promise.all([
      service
        .from('profiles')
        .select('id, email, display_name, created_at, updated_at, admin_role')
        .eq('id', userId)
        .maybeSingle<ProfileRow>(),
      service
        .from('user_preferences')
        .select(
          'user_id, language, theme, country_code, country_name, content_language_name, synced_at'
        )
        .eq('user_id', userId)
        .maybeSingle<UserPreferencesRow>(),
      service
        .from('user_progress')
        .select('user_id, current_book, current_chapter, streak_days, last_read_date')
        .eq('user_id', userId)
        .maybeSingle<UserProgressRow>(),
      service
        .from('user_devices')
        .select('id, user_id, push_token, platform, app_version, is_active, created_at')
        .eq('user_id', userId),
      service
        .from('user_engagement_summary')
        .select(
          'user_id, engagement_score, total_chapters_read, total_listening_minutes, total_sessions, last_active_date'
        )
        .eq('user_id', userId)
        .maybeSingle<UserEngagementRow>(),
      service
        .from('user_reading_plan_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      service
        .from('chapter_feedback_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      service
        .from('analytics_events')
        .select('session_id')
        .eq('user_id', userId)
        .not('session_id', 'is', null),
      service
        .from('admin_audit_logs')
        .select('id, action, actor_email, entity_type, entity_id, summary, created_at')
        .contains('metadata', { targetUserId: userId })
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  if (!profile.data) {
    return null;
  }

  const sessionIds = new Set(
    (events.data ?? []).map((row) => row.session_id as string).filter(Boolean)
  );

  return {
    devices: (devices.data ?? []) as UserDeviceRow[],
    engagement: (engagement.data ?? null) as UserEngagementRow | null,
    feedbackCount: feedback.count ?? 0,
    planCount: plans.count ?? 0,
    preferences: (preferences.data ?? null) as UserPreferencesRow | null,
    profile: profile.data,
    progress: (progress.data ?? null) as UserProgressRow | null,
    recentAuditLogs: (audits.data ?? []) as AuditLogRow[],
    sessionCount: sessionIds.size,
  };
}

// Selectable rolling windows for the shared analytics overview. The dashboard
// labels derive from the SELECTED value so the copy can never drift from the
// actual query window.
export const ANALYTICS_WINDOW_OPTIONS = [7, 30, 90, 180] as const;
export type AnalyticsWindowDays = (typeof ANALYTICS_WINDOW_OPTIONS)[number];
export const DEFAULT_ANALYTICS_WINDOW_DAYS: AnalyticsWindowDays = 180;
// Back-compat alias (default window).
export const ANALYTICS_WINDOW_DAYS = DEFAULT_ANALYTICS_WINDOW_DAYS;

// Whitelists an untrusted query-param value to a supported window, defaulting to
// 180d. Never passes an arbitrary number through to the RPC.
export function normalizeAnalyticsWindow(value: unknown): AnalyticsWindowDays {
  const parsed = Array.isArray(value) ? value[0] : value;
  const days = Number(parsed);
  return (ANALYTICS_WINDOW_OPTIONS as readonly number[]).includes(days)
    ? (days as AnalyticsWindowDays)
    : DEFAULT_ANALYTICS_WINDOW_DAYS;
}

export async function getAnalyticsOverview(
  windowDays: AnalyticsWindowDays = DEFAULT_ANALYTICS_WINDOW_DAYS
): Promise<AnalyticsOverview> {
  const service = createAdminServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  // S16: engagement scores are pre-computed by the nightly cron, NOT within this
  // window — expose when they were last refreshed. The RPC doesn't return this,
  // so query the summary table's freshest updated_at in parallel. Its error is
  // intentionally ignored (empty table => null => "not yet computed") so a
  // missing timestamp never takes down the whole dashboard.
  const [overviewResult, engagementResult] = await Promise.all([
    service.rpc('get_admin_analytics_overview', {
      p_since: since.toISOString(),
      p_total_days: windowDays,
    }),
    service
      .from('user_engagement_summary')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data, error } = overviewResult;
  if (error) {
    throw new Error(`Unable to load shared analytics overview: ${error.message}`);
  }

  const engagementScoreComputedAt =
    (engagementResult.data as { updated_at?: string } | null)?.updated_at ?? null;

  const overview = ((data ?? {}) as AnalyticsOverviewRpcPayload) ?? {};
  const countryMetrics = overview.countryMetrics?.length
    ? mapCountryRollupsToMetrics(overview.countryMetrics as CountryMetricRollup[])
    : [];
  const locationMetrics = overview.locationMetrics?.length
    ? mapLocationRollupsToMetrics(overview.locationMetrics)
    : [];
  const dailyListeningMinutes = (overview.dailyListeningMinutes ?? []).map((point) => ({
    day: point.day,
    minutes: Number(point.value ?? 0),
  }));
  const dailyReadingMinutes = (overview.dailyReadingMinutes ?? []).map((point) => ({
    day: point.day,
    minutes: Number(point.value ?? 0),
  }));

  const translationBreakdown = buildTranslationBreakdown(
    (overview.translationCountryMetrics ?? []) as TranslationCountryRollup[],
    (overview.translationLocationMetrics ?? []) as TranslationLocationRollup[],
    (overview.translationListeningMinutes ?? []) as TranslationListeningRollup[],
    (overview.translationListenerCounts ?? []) as TranslationListenerRollup[]
  );

  return {
    activeCountryCount: Number(overview.activeCountryCount ?? 0),
    activeLocationCount: locationMetrics.length,
    averageEngagementScore: Number(overview.averageEngagementScore ?? 0),
    engagementScoreComputedAt,
    countryMetrics,
    dailyDownloadUnits: (overview.dailyDownloadUnits ?? []).map((point) => ({
      day: point.day,
      value: Number(point.value ?? 0),
    })),
    dailyListeningMinutes,
    dailyReadingMinutes,
    listeningTotalMinutes: Number(overview.listeningTotalMinutes ?? 0),
    locatedListenerCount: Number(overview.locatedListenerCount ?? 0),
    locationMetrics,
    readingTotalMinutes: Number(overview.readingTotalMinutes ?? 0),
    totalDownloadUnits: Number(overview.totalDownloadUnits ?? 0),
    totalTrackedSessions: Number(overview.totalTrackedSessions ?? 0),
    translationBreakdown,
    userCountWithListening: Number(overview.userCountWithListening ?? 0),
  };
}
