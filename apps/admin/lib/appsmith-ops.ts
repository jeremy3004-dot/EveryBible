import { createAdminServiceClient } from './supabase/service';
import { buildMediaHealthIssues, readNestedString } from './appsmith-ops-utils';
import type { TranslationCatalogOpsRow } from './appsmith-ops-utils';

export {
  authorizeAppsmithOpsRequest,
  buildMediaHealthIssues,
  getAppsmithOpsApiKey,
} from './appsmith-ops-utils';

const DEFAULT_FEEDBACK_LIMIT = 200;
const MAX_FEEDBACK_LIMIT = 500;

type TranslationVersionOpsRow = {
  is_current: boolean;
  total_books: number | null;
  total_chapters: number | null;
  total_verses: number | null;
  translation_id: string;
  version_number: number;
};

type SyncRunOpsRow = {
  failed_count: number;
  finished_at: string | null;
  id: string;
  message: string | null;
  started_at: string;
  state: 'idle' | 'running' | 'succeeded' | 'failed';
};

type ChapterFeedbackOpsRow = {
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
  export_error: string | null;
  export_status: 'pending' | 'exported' | 'failed';
  exported_at: string | null;
  id: string;
  interface_language: string;
  participant_name: string | null;
  participant_role: string | null;
  scripture_council_fixed_at: string | null;
  scripture_council_fixed_by: string | null;
  scripture_council_fixed_note: string | null;
  sentiment: 'up' | 'down';
  source_screen: string;
  translation_id: string;
  translation_language: string;
};

function summarizeCounts<T extends string>(
  values: readonly T[],
  knownValues: readonly T[]
): Record<T, number> {
  const counts = Object.fromEntries(knownValues.map((value) => [value, 0])) as Record<T, number>;
  values.forEach((value) => {
    counts[value] += 1;
  });
  return counts;
}

export async function getOpsTranslationCatalogStatus() {
  const service = createAdminServiceClient();
  const [
    { data: catalog, error: catalogError },
    { data: versions, error: versionsError },
    { data: syncRuns, error: syncError },
  ] = await Promise.all([
    service
      .from('translation_catalog')
      .select(
        'translation_id, name, abbreviation, language_name, has_text, has_audio, is_available, distribution_state, updated_at, upstream_last_synced_at'
      )
      .order('language_name', { ascending: true })
      .order('name', { ascending: true }),
    service
      .from('translation_versions')
      .select(
        'translation_id, version_number, is_current, total_books, total_chapters, total_verses'
      )
      .eq('is_current', true),
    service
      .from('translation_sync_runs')
      .select('id, state, started_at, finished_at, failed_count, message')
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  if (catalogError) {
    throw new Error(`Unable to load translation catalog: ${catalogError.message}`);
  }
  if (versionsError) {
    throw new Error(`Unable to load translation versions: ${versionsError.message}`);
  }
  if (syncError) {
    throw new Error(`Unable to load translation sync runs: ${syncError.message}`);
  }

  const currentVersions = new Map(
    ((versions ?? []) as TranslationVersionOpsRow[]).map((version) => [
      version.translation_id,
      version,
    ])
  );
  const rows = (catalog ?? []) as TranslationCatalogOpsRow[];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: rows.length,
      available: rows.filter((row) => row.is_available).length,
      published: rows.filter((row) => row.distribution_state === 'published').length,
      hidden: rows.filter((row) => row.distribution_state === 'hidden').length,
      missingCurrentVersion: rows.filter((row) => !currentVersions.has(row.translation_id)).length,
      failedSyncRuns: ((syncRuns ?? []) as SyncRunOpsRow[]).filter((run) => run.state === 'failed')
        .length,
    },
    translations: rows.map((row) => {
      const currentVersion = currentVersions.get(row.translation_id);
      return {
        abbreviation: row.abbreviation,
        currentVersion: currentVersion?.version_number ?? null,
        distributionState: row.distribution_state ?? 'draft',
        hasAudio: row.has_audio,
        hasText: row.has_text,
        isAvailable: row.is_available,
        languageName: row.language_name,
        name: row.name,
        totalBooks: currentVersion?.total_books ?? null,
        totalChapters: currentVersion?.total_chapters ?? null,
        totalVerses: currentVersion?.total_verses ?? null,
        translationId: row.translation_id,
        updatedAt: row.updated_at,
        upstreamLastSyncedAt: row.upstream_last_synced_at ?? null,
      };
    }),
    recentSyncRuns: ((syncRuns ?? []) as SyncRunOpsRow[]).map((run) => ({
      failedCount: run.failed_count,
      finishedAt: run.finished_at,
      id: run.id,
      hasMessage: Boolean(run.message),
      startedAt: run.started_at,
      state: run.state,
    })),
  };
}

export async function getOpsMediaManifestHealth() {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('translation_catalog')
    .select(
      'translation_id, name, language_name, has_text, has_audio, is_available, distribution_state, catalog, updated_at'
    )
    .order('language_name', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Unable to load media manifest health: ${error.message}`);
  }

  const rows = (data ?? []) as TranslationCatalogOpsRow[];
  const translations = rows.map((row) => {
    const catalog = row.catalog ?? null;
    const issues = buildMediaHealthIssues(row);

    return {
      audioStrategy: readNestedString(catalog, ['audio', 'strategy']),
      distributionState: row.distribution_state ?? 'draft',
      hasAudio: row.has_audio,
      hasAudioDeliveryReference: Boolean(
        readNestedString(catalog, ['audio', 'downloadUrl']) ??
          readNestedString(catalog, ['audio', 'provider']) ??
          readNestedString(catalog, ['audio', 'baseUrl'])
      ),
      hasAudioFileExtension: Boolean(readNestedString(catalog, ['audio', 'fileExtension'])),
      hasAudioMimeType: Boolean(readNestedString(catalog, ['audio', 'mimeType'])),
      hasTextDownloadUrl: Boolean(readNestedString(catalog, ['text', 'downloadUrl'])),
      hasTextSha256: Boolean(readNestedString(catalog, ['text', 'sha256'])),
      hasText: row.has_text,
      isAvailable: row.is_available,
      issueCount: issues.length,
      issues,
      languageName: row.language_name,
      name: row.name,
      translationId: row.translation_id,
      updatedAt: row.updated_at,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: translations.length,
      healthy: translations.filter((row) => row.issueCount === 0).length,
      withIssues: translations.filter((row) => row.issueCount > 0).length,
      textEnabledMissingTextPack: translations.filter((row) =>
        row.issues.includes('missing_text_download_url')
      ).length,
      audioEnabledMissingDelivery: translations.filter((row) =>
        row.issues.includes('missing_audio_delivery_reference')
      ).length,
      availableWithoutTextOrAudio: translations.filter((row) =>
        row.issues.includes('available_without_text_or_audio')
      ).length,
    },
    translations,
  };
}

function clampFeedbackLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FEEDBACK_LIMIT;
  }
  return Math.max(1, Math.min(MAX_FEEDBACK_LIMIT, parsed));
}

export async function getOpsChapterFeedbackTriage(requestUrl: string) {
  const service = createAdminServiceClient();
  const url = new URL(requestUrl);
  const limit = clampFeedbackLimit(url.searchParams.get('limit'));
  const status = url.searchParams.get('status');
  const language = url.searchParams.get('language')?.trim();
  const translationId = url.searchParams.get('translationId')?.trim();
  const bookId = url.searchParams.get('bookId')?.trim().toUpperCase();
  const chapter = Number.parseInt(url.searchParams.get('chapter') ?? '', 10);
  const sentiment = url.searchParams.get('sentiment');
  const responseType = url.searchParams.get('responseType');
  const fixStatus = url.searchParams.get('fixStatus');
  const validStatus =
    status === 'pending' || status === 'exported' || status === 'failed' ? status : null;
  const validSentiment = sentiment === 'up' || sentiment === 'down' ? sentiment : null;
  const validFixStatus = fixStatus === 'open' || fixStatus === 'fixed' ? fixStatus : null;

  let query = service
    .from('chapter_feedback_submissions')
    .select(
      'id, created_at, translation_language, translation_id, book_id, chapter, sentiment, comment, participant_name, participant_role, interface_language, content_language_code, content_language_name, source_screen, app_platform, app_version, export_status, exported_at, export_error, audio_response_bucket, audio_response_path, audio_response_mime_type, audio_response_size_bytes, audio_response_duration_ms, audio_response_created_at, scripture_council_fixed_at, scripture_council_fixed_by, scripture_council_fixed_note'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (validStatus) {
    query = query.eq('export_status', validStatus);
  }
  if (language) {
    query = query.eq('translation_language', language);
  }
  if (translationId) {
    query = query.eq('translation_id', translationId);
  }
  if (bookId) {
    query = query.eq('book_id', bookId);
  }
  if (Number.isInteger(chapter) && chapter > 0) {
    query = query.eq('chapter', chapter);
  }
  if (validSentiment) {
    query = query.eq('sentiment', validSentiment);
  }
  if (validFixStatus === 'open') {
    query = query.eq('sentiment', 'down').is('scripture_council_fixed_at', null);
  } else if (validFixStatus === 'fixed') {
    query = query.not('scripture_council_fixed_at', 'is', null);
  }
  if (responseType === 'audio') {
    query = query.not('audio_response_path', 'is', null);
  } else if (responseType === 'text') {
    query = query.not('comment', 'is', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to load chapter feedback triage: ${error.message}`);
  }

  const rows = (data ?? []) as ChapterFeedbackOpsRow[];
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
  const statusCounts = summarizeCounts(
    rows.map((row) => row.export_status),
    ['pending', 'exported', 'failed'] as const
  );
  const sentimentCounts = summarizeCounts(
    rows.map((row) => row.sentiment),
    ['up', 'down'] as const
  );

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      bookId: bookId || null,
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : null,
      language: language || null,
      fixStatus: validFixStatus,
      responseType: responseType === 'audio' || responseType === 'text' ? responseType : null,
      sentiment: validSentiment,
      status: validStatus,
      translationId: translationId || null,
    },
    limit,
    statusFilter: validStatus,
    summary: {
      totalReturned: rows.length,
      exportStatus: statusCounts,
      sentiment: sentimentCounts,
    },
    feedback: rows.map((row, index) => ({
      appPlatform: row.app_platform,
      appVersion: row.app_version,
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
      bookId: row.book_id,
      chapter: row.chapter,
      commentPreview: row.comment ? row.comment.slice(0, 240) : null,
      contentLanguageCode: row.content_language_code,
      contentLanguageName: row.content_language_name,
      createdAt: row.created_at,
      exportError: row.export_error,
      exportStatus: row.export_status,
      exportedAt: row.exported_at,
      id: row.id,
      interfaceLanguage: row.interface_language,
      participantName: row.participant_name,
      participantRole: row.participant_role,
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
    })),
  };
}
