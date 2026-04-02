import type { OperatorAuditMetadata } from './operator-audit-metadata';

import { adminNavigation } from '@/lib/admin-navigation';
import {
  type CountryMetric,
  type CountryMetricRollup,
  type DailyMetricPoint,
  mapCountryRollupsToMetrics,
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

export interface OperatorAuditLogRow extends AuditLogRow {
  metadata: OperatorAuditMetadata | null;
}

export interface DashboardSummary {
  adminPathCount: number;
  failedSyncCount: number;
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
  createdAt: string;
  id: string;
  referenceLabel: string;
  reflection: string | null;
  startsAt: string | null;
  state: 'draft' | 'scheduled' | 'live' | 'archived';
  title: string | null;
  translationId: string;
  updatedAt: string;
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

export interface AnalyticsOverview {
  activeCountryCount: number;
  averageEngagementScore: number;
  countryMetrics: CountryMetric[];
  dailyDownloadUnits: DailyMetricPoint[];
  dailyListeningMinutes: Array<{ day: string; minutes: number }>;
  listeningTotalMinutes: number;
  totalDownloadUnits: number;
  totalTrackedSessions: number;
  userCountWithListening: number;
}

interface AnalyticsOverviewRpcPayload {
  activeCountryCount?: number;
  averageEngagementScore?: number;
  countryMetrics?: CountryMetricRollup[];
  dailyDownloadUnits?: DailyMetricPoint[];
  dailyListeningMinutes?: DailyMetricPoint[];
  listeningTotalMinutes?: number;
  totalDownloadUnits?: number;
  totalTrackedSessions?: number;
  userCountWithListening?: number;
}

function isWithinWindow(
  startsAt: string | null,
  endsAt: string | null,
  now = Date.now()
): boolean {
  const startsOk = !startsAt || new Date(startsAt).getTime() <= now;
  const endsOk = !endsAt || new Date(endsAt).getTime() >= now;
  return startsOk && endsOk;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const service = createAdminServiceClient();

  const [
    translations,
    failedSyncs,
    liveVerses,
    liveImages,
    supportUsers,
  ] = await Promise.all([
    service.from('translation_catalog').select('translation_id', { count: 'exact', head: true }),
    service
      .from('translation_sync_runs')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'failed'),
    service.from('verse_of_day_entries').select('id, starts_at, ends_at, state'),
    service.from('content_images').select('id, starts_at, ends_at, state'),
    service.from('profiles').select('id', { count: 'exact', head: true }),
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

export async function getRecentOperatorAuditLogs(
  limit = 12
): Promise<OperatorAuditLogRow[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('admin_audit_logs')
    .select('id, action, actor_email, entity_type, entity_id, metadata, summary, created_at')
    .contains('metadata', { actorSource: 'openclaw' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load operator audit logs: ${error.message}`);
  }

  return ((data ?? []) as AuditLogRow[]).map((row) => ({
    ...row,
    metadata: row.metadata ? (row.metadata as OperatorAuditMetadata) : null,
  }));
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

  return (catalog as TranslationCatalogRow[] | null ?? []).map((row) => ({
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

  const currentVersion =
    (versions ?? []).find((row) => row.is_current)?.version_number ?? null;

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

export async function listVerseOfDayEntries(): Promise<VerseOfDayListItem[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('verse_of_day_entries')
    .select(
      'id, title, translation_id, reference_label, verse_text, reflection, state, starts_at, created_at, updated_at, image_id'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load verse-of-day entries: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    createdAt: row.created_at as string,
    id: row.id as string,
    referenceLabel: row.reference_label as string,
    reflection: row.reflection as string | null,
    startsAt: row.starts_at as string | null,
    state: row.state as VerseOfDayListItem['state'],
    title: row.title as string | null,
    translationId: row.translation_id as string,
    updatedAt: row.updated_at as string,
    verseText: row.verse_text as string,
  }));
}

export async function listContentImages(): Promise<ContentImageRow[]> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('content_images')
    .select('id, title, kind, state, alt_text, public_url, starts_at, updated_at')
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
  } else if (
    new Date(latestSuccessfulSync.started_at).getTime() <
    now - 1000 * 60 * 60 * 24
  ) {
    issues.push({
      description: 'The latest successful sync is more than 24 hours old.',
      href: '/translations',
      severity: 'warning',
      title: 'Translation sync is stale',
    });
  }

  const liveVerseCount = (verses.data ?? []).filter((row) => {
    return row.state === 'live' && isWithinWindow(row.starts_at as string | null, row.ends_at as string | null);
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
    return row.state === 'live' && (!row.public_url || !isWithinWindow(row.starts_at as string | null, row.ends_at as string | null));
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
    service
      .from('user_preferences')
      .select('user_id, country_name')
      .in('user_id', userIds),
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

export async function getSupportUserDetail(
  userId: string
): Promise<SupportUserDetail | null> {
  const service = createAdminServiceClient();
  const [
    profile,
    preferences,
    progress,
    devices,
    engagement,
    plans,
    feedback,
    events,
    audits,
  ] = await Promise.all([
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

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const service = createAdminServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data, error } = await service.rpc('get_admin_analytics_overview', {
    p_since: since.toISOString(),
    p_total_days: 30,
  });

  if (error) {
    throw new Error(`Unable to load shared analytics overview: ${error.message}`);
  }

  const overview = ((data ?? {}) as AnalyticsOverviewRpcPayload) ?? {};
  const countryMetrics = mapCountryRollupsToMetrics(overview.countryMetrics ?? []);
  const dailyListeningMinutes = (overview.dailyListeningMinutes ?? []).map((point) => ({
    day: point.day,
    minutes: Number(point.value ?? 0),
  }));

  return {
    activeCountryCount: Number(overview.activeCountryCount ?? countryMetrics.length),
    averageEngagementScore: Number(overview.averageEngagementScore ?? 0),
    countryMetrics,
    dailyDownloadUnits: (overview.dailyDownloadUnits ?? []).map((point) => ({
      day: point.day,
      value: Number(point.value ?? 0),
    })),
    dailyListeningMinutes,
    listeningTotalMinutes: Number(overview.listeningTotalMinutes ?? 0),
    totalDownloadUnits: Number(overview.totalDownloadUnits ?? 0),
    totalTrackedSessions: Number(overview.totalTrackedSessions ?? 0),
    userCountWithListening: Number(overview.userCountWithListening ?? 0),
  };
}
