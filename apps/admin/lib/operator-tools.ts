// Read-only tools exposed to the Gemini-backed admin operator (Phase 5). Each
// executor calls an existing admin-data function under the caller's already
// verified admin identity and returns a COMPACT, JSON-serialisable summary
// (never the full multi-hundred-row payloads). The operator is strictly
// read-only — there are no mutating tools here by design.

import {
  getAnalyticsOverview,
  getDashboardSummary,
  getHealthIssues,
  getRecentAuditLogs,
  getSupportUserDetail,
  getTranslationDetail,
  listChapterFeedback,
  listSupportUsers,
  listSyncRuns,
  listTranslations,
  normalizeAnalyticsWindow,
} from './admin-data';

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

type ToolArgs = Record<string, unknown>;
type ToolExecutor = (args: ToolArgs) => Promise<unknown>;

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function int(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function summarizeSyncRun(run: Awaited<ReturnType<typeof listSyncRuns>>[number]) {
  return {
    state: run.state,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    insertedCount: run.inserted_count,
    updatedCount: run.updated_count,
    failedCount: run.failed_count,
    message: run.message,
  };
}

export const OPERATOR_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'get_health_snapshot',
    description:
      'Current operational health: dashboard summary counts (failed syncs, chapter feedback, support users, translation catalog size) plus the active health issues with severity.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_analytics_overview',
    description:
      'Usage analytics for a time window: listening/reading minutes, downloads, total + located listeners, active country count, and the top countries and translations by activity.',
    parameters: {
      type: 'object',
      properties: {
        windowDays: {
          type: 'number',
          description: 'Time window in days (7, 30, 90, or 180). Defaults to 180.',
        },
      },
    },
  },
  {
    name: 'list_translations',
    description:
      'The imported translation catalog, optionally filtered by a search term (id, name, language, abbreviation).',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional search term.' },
      },
    },
  },
  {
    name: 'get_translation_detail',
    description: 'Delivery + version detail for a single translation by its id (e.g. "bsb").',
    parameters: {
      type: 'object',
      properties: {
        translationId: { type: 'string', description: 'The translation id.' },
      },
      required: ['translationId'],
    },
  },
  {
    name: 'list_chapter_feedback',
    description:
      'Recent chapter-level translation feedback from the mobile app (excludes test data). Optionally filter by search term, sentiment ("up"/"down"), or fix status ("open"/"fixed").',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        sentiment: { type: 'string', description: '"up" (accurate) or "down" (needs work).' },
        fixStatus: { type: 'string', description: '"open" or "fixed".' },
      },
    },
  },
  {
    name: 'get_support_user',
    description:
      'Look up a support user by email or display name and return their account, reading, and engagement context.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Email or display name to search for.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_audit_logs',
    description: 'Most recent admin audit-trail entries (who did what, when).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows (default 10).' } },
    },
  },
  {
    name: 'list_sync_runs',
    description: 'Recent upstream translation sync runs with their status and error messages.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows (default 10).' } },
    },
  },
];

export const OPERATOR_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  get_health_snapshot: async () => {
    const [summary, issues] = await Promise.all([getDashboardSummary(), getHealthIssues()]);
    return {
      summary: {
        adminPathCount: summary.adminPathCount,
        failedSyncCount: summary.failedSyncCount,
        feedbackCount: summary.feedbackCount,
        supportUserCount: summary.supportUserCount,
        translationCount: summary.translationCount,
      },
      issues: issues.map((issue) => ({
        title: issue.title,
        severity: issue.severity,
        detail: issue.description,
      })),
    };
  },

  get_analytics_overview: async (args) => {
    const windowDays = normalizeAnalyticsWindow(args.windowDays);
    const overview = await getAnalyticsOverview(windowDays);
    return {
      windowDays,
      listeningTotalMinutes: overview.listeningTotalMinutes,
      readingTotalMinutes: overview.readingTotalMinutes,
      totalDownloadUnits: overview.totalDownloadUnits,
      totalTrackedSessions: overview.totalTrackedSessions,
      listenersTotal: overview.userCountWithListening,
      listenersLocated: overview.locatedListenerCount,
      activeCountryCount: overview.activeCountryCount,
      averageEngagementScore: overview.averageEngagementScore,
      topCountries: overview.countryMetrics.slice(0, 8).map((c) => ({
        country: c.name,
        listeningMinutes: c.listeningMinutes,
        readingMinutes: c.readingMinutes,
        listeners: c.listenerCount,
        downloads: c.downloadUnits,
      })),
      topTranslations: overview.translationBreakdown.slice(0, 8).map((t) => ({
        translation: t.translationId,
        listeningMinutes: t.listeningMinutes,
        listeners: t.listenerCount,
        downloads: t.downloadUnits,
      })),
    };
  },

  list_translations: async (args) => {
    const translations = await listTranslations(str(args.search));
    return {
      count: translations.length,
      translations: translations.slice(0, 40).map((t) => ({
        id: t.translationId,
        name: t.name,
        language: t.languageName,
        distributionState: t.distributionState,
        hasText: t.hasText,
        hasAudio: t.hasAudio,
      })),
    };
  },

  get_translation_detail: async (args) => {
    const id = str(args.translationId);
    if (!id) return { error: 'translationId is required.' };
    const detail = await getTranslationDetail(id);
    if (!detail) return { error: `No translation found for id "${id}".` };
    return {
      translationId: detail.translationId,
      name: detail.name,
      abbreviation: detail.abbreviation,
      languageName: detail.languageName,
      distributionState: detail.distributionState,
      hasText: detail.hasText,
      hasAudio: detail.hasAudio,
      isAvailable: detail.isAvailable,
      currentVersion: detail.currentVersion,
      updatedAt: detail.updatedAt,
      upstreamLastSyncedAt: detail.upstreamLastSyncedAt,
      versions: detail.versions.map((version) => ({
        version: version.version_number,
        current: version.is_current,
        publishedAt: version.published_at,
        totalBooks: version.total_books,
        totalChapters: version.total_chapters,
        totalVerses: version.total_verses,
      })),
      recentRuns: detail.recentRuns.map(summarizeSyncRun),
    };
  },

  list_chapter_feedback: async (args) => {
    const items = await listChapterFeedback({
      query: str(args.search),
      sentiment:
        str(args.sentiment) === 'up' ? 'up' : str(args.sentiment) === 'down' ? 'down' : undefined,
      fixStatus:
        str(args.fixStatus) === 'open'
          ? 'open'
          : str(args.fixStatus) === 'fixed'
            ? 'fixed'
            : undefined,
    });
    return {
      count: items.length,
      items: items.slice(0, 20).map((item) => ({
        reference: `${item.bookId} ${item.chapter}`,
        translation: item.translationId,
        sentiment: item.sentiment,
        comment: item.comment,
        reviewer: item.reviewerDisplayName ?? item.participantLabel,
        resolved: Boolean(item.scriptureCouncilFix),
        submittedAt: item.createdAt,
      })),
    };
  },

  get_support_user: async (args) => {
    const query = str(args.query);
    if (!query) return { error: 'query is required.' };
    const matches = await listSupportUsers(query);
    if (matches.length === 0) return { error: `No user found matching "${query}".` };
    const detail = await getSupportUserDetail(matches[0].id);
    const match = matches[0];
    // This is a provider-facing DTO: allowlist every nested field. Never spread
    // admin records here; they contain push tokens and direct user identities.
    return {
      match: {
        createdAt: match.createdAt,
        currentBook: match.currentBook,
        currentChapter: match.currentChapter,
        engagementScore: match.engagementScore,
        lastActiveDate: match.lastActiveDate,
        streakDays: match.streakDays,
      },
      detail: detail
        ? {
            preferences: detail.preferences
              ? {
                  language: detail.preferences.language,
                  theme: detail.preferences.theme,
                  contentLanguage: detail.preferences.content_language_name,
                  syncedAt: detail.preferences.synced_at,
                }
              : null,
            progress: detail.progress
              ? {
                  currentBook: detail.progress.current_book,
                  currentChapter: detail.progress.current_chapter,
                  lastReadDate: detail.progress.last_read_date,
                  streakDays: detail.progress.streak_days,
                }
              : null,
            engagement: detail.engagement
              ? {
                  score: detail.engagement.engagement_score,
                  lastActiveDate: detail.engagement.last_active_date,
                  chaptersRead: detail.engagement.total_chapters_read,
                  listeningMinutes: detail.engagement.total_listening_minutes,
                  sessions: detail.engagement.total_sessions,
                }
              : null,
            feedbackCount: detail.feedbackCount,
            planCount: detail.planCount,
            sessionCount: detail.sessionCount,
          }
        : null,
    };
  },

  list_audit_logs: async (args) => {
    const logs = await getRecentAuditLogs(int(args.limit) ?? 10);
    return {
      count: logs.length,
      logs: logs.map((log) => ({
        at: log.created_at,
        action: log.action,
        entity: log.entity_type,
        actor: log.actor_email,
        summary: log.summary,
      })),
    };
  },

  list_sync_runs: async (args) => {
    const runs = await listSyncRuns(int(args.limit) ?? 10);
    return { count: runs.length, runs: runs.map(summarizeSyncRun) };
  },
};
