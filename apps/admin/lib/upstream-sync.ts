import { createAdminServiceClient } from '@/lib/supabase/service';
import { getAdminServerEnv } from '@/lib/env';

interface NormalizedVersion {
  changelog: string | null;
  dataChecksum: string | null;
  isCurrent: boolean;
  publishedAt: string;
  totalBooks: number | null;
  totalChapters: number | null;
  totalVerses: number | null;
  versionNumber: number;
}

interface NormalizedTranslation {
  abbreviation: string;
  adminNotes: string | null;
  catalog: Record<string, unknown> | null;
  distributionState: 'draft' | 'ready' | 'published' | 'hidden';
  hasAudio: boolean;
  hasText: boolean;
  isAvailable: boolean;
  languageCode: string;
  languageName: string;
  licenseType: string | null;
  licenseUrl: string | null;
  name: string;
  sourceUrl: string | null;
  translationId: string;
  upstreamExternalId: string | null;
  upstreamPayload: Record<string, unknown>;
  versions: NormalizedVersion[];
}

function resolveItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.translations, record.items, record.data, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDistributionState(
  value: unknown
): 'draft' | 'ready' | 'published' | 'hidden' {
  const normalized = asString(value)?.toLowerCase();

  if (normalized === 'published' || normalized === 'hidden' || normalized === 'draft') {
    return normalized;
  }

  return 'ready';
}

function normalizeVersions(item: Record<string, unknown>): NormalizedVersion[] {
  const rawVersions = Array.isArray(item.versions) ? item.versions : [];
  const normalizedFromArray = rawVersions
    .map((rawVersion, index) => {
      const version = asRecord(rawVersion);
      const versionNumber = asNumber(version.version_number) ?? asNumber(version.versionNumber) ?? index + 1;

      return {
        changelog: asString(version.changelog),
        dataChecksum: asString(version.data_checksum) ?? asString(version.dataChecksum),
        isCurrent: asBoolean(version.is_current, index === rawVersions.length - 1),
        publishedAt: asString(version.published_at) ?? asString(version.publishedAt) ?? new Date().toISOString(),
        totalBooks: asNumber(version.total_books) ?? asNumber(version.totalBooks),
        totalChapters: asNumber(version.total_chapters) ?? asNumber(version.totalChapters),
        totalVerses: asNumber(version.total_verses) ?? asNumber(version.totalVerses),
        versionNumber,
      };
    })
    .filter((version) => Number.isFinite(version.versionNumber));

  if (normalizedFromArray.length > 0) {
    return normalizedFromArray;
  }

  return [
    {
      changelog: null,
      dataChecksum: null,
      isCurrent: true,
      publishedAt: new Date().toISOString(),
      totalBooks: asNumber(item.total_books) ?? asNumber(item.totalBooks),
      totalChapters: asNumber(item.total_chapters) ?? asNumber(item.totalChapters),
      totalVerses: asNumber(item.total_verses) ?? asNumber(item.totalVerses),
      versionNumber:
        asNumber(item.version_number) ?? asNumber(item.versionNumber) ?? 1,
    },
  ];
}

function normalizeTranslation(rawItem: unknown): NormalizedTranslation | null {
  const item = asRecord(rawItem);
  const translationId =
    asString(item.translation_id) ??
    asString(item.translationId) ??
    asString(item.id) ??
    asString(item.slug);

  if (!translationId) {
    return null;
  }

  const language = asRecord(item.language);

  return {
    abbreviation:
      asString(item.abbreviation) ??
      asString(item.abbr) ??
      translationId.toUpperCase(),
    adminNotes: asString(item.admin_notes) ?? asString(item.adminNotes),
    catalog: asRecord(item.catalog),
    distributionState: normalizeDistributionState(
      item.distribution_state ?? item.distributionState
    ),
    hasAudio: asBoolean(item.has_audio ?? item.hasAudio ?? asRecord(item.audio).available, false),
    hasText: asBoolean(item.has_text ?? item.hasText, true),
    isAvailable: asBoolean(item.is_available ?? item.isAvailable, true),
    languageCode:
      asString(item.language_code) ??
      asString(item.languageCode) ??
      asString(language.code) ??
      'und',
    languageName:
      asString(item.language_name) ??
      asString(item.languageName) ??
      asString(language.name) ??
      'Unknown',
    licenseType: asString(item.license_type) ?? asString(item.licenseType),
    licenseUrl: asString(item.license_url) ?? asString(item.licenseUrl),
    name: asString(item.name) ?? translationId,
    sourceUrl: asString(item.source_url) ?? asString(item.sourceUrl),
    translationId,
    upstreamExternalId:
      asString(item.external_id) ??
      asString(item.externalId) ??
      asString(item.upstream_id) ??
      asString(item.upstreamId),
    upstreamPayload: item,
    versions: normalizeVersions(item),
  };
}

function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/translations') ? trimmed : `${trimmed}/translations`;
}

export async function runUpstreamTranslationSync(actorUserId: string) {
  const env = getAdminServerEnv();
  const service = createAdminServiceClient();
  const endpoint = buildEndpoint(env.upstreamApiBaseUrl);

  const { data: syncRun, error: createRunError } = await service
    .from('translation_sync_runs')
    .insert({
      source: 'upstream-api',
      started_at: new Date().toISOString(),
      state: 'running',
      triggered_by: actorUserId,
      upstream_endpoint: endpoint,
    })
    .select('id')
    .single<{ id: string }>();

  if (createRunError || !syncRun) {
    throw new Error(`Unable to start sync run: ${createRunError?.message ?? 'unknown error'}`);
  }

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.upstreamApiKey}`,
        'x-api-key': env.upstreamApiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream sync failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const normalized = resolveItems(payload)
      .map((item) => normalizeTranslation(item))
      .filter((item): item is NormalizedTranslation => Boolean(item));

    if (normalized.length === 0) {
      throw new Error('Upstream payload did not contain any translations.');
    }

    const translationIds = normalized.map((item) => item.translationId);
    const { data: existingTranslations, error: existingError } = await service
      .from('translation_catalog')
      .select('translation_id')
      .in('translation_id', translationIds);

    if (existingError) {
      throw new Error(`Unable to inspect translation catalog: ${existingError.message}`);
    }

    const existingSet = new Set(
      (existingTranslations ?? []).map((item) => item.translation_id as string)
    );

    let insertedCount = 0;
    let updatedCount = 0;

    for (const translation of normalized) {
      const existed = existingSet.has(translation.translationId);
      const { error: upsertCatalogError } = await service
        .from('translation_catalog')
        .upsert(
          {
            abbreviation: translation.abbreviation,
            admin_notes: translation.adminNotes,
            catalog: translation.catalog,
            distribution_state: translation.distributionState,
            has_audio: translation.hasAudio,
            has_text: translation.hasText,
            is_available: translation.isAvailable,
            language_code: translation.languageCode,
            language_name: translation.languageName,
            license_type: translation.licenseType,
            license_url: translation.licenseUrl,
            name: translation.name,
            source_url: translation.sourceUrl,
            sync_run_id: syncRun.id,
            translation_id: translation.translationId,
            upstream_external_id: translation.upstreamExternalId,
            upstream_last_synced_at: new Date().toISOString(),
            upstream_payload: translation.upstreamPayload,
          },
          { onConflict: 'translation_id' }
        );

      if (upsertCatalogError) {
        throw new Error(
          `Unable to upsert translation ${translation.translationId}: ${upsertCatalogError.message}`
        );
      }

      if (existed) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }

      for (const version of translation.versions) {
        const { error: versionError } = await service
          .from('translation_versions')
          .upsert(
            {
              changelog: version.changelog,
              data_checksum: version.dataChecksum,
              is_current: version.isCurrent,
              published_at: version.publishedAt,
              total_books: version.totalBooks,
              total_chapters: version.totalChapters,
              total_verses: version.totalVerses,
              translation_id: translation.translationId,
              version_number: version.versionNumber,
            },
            { onConflict: 'translation_id,version_number' }
          );

        if (versionError) {
          throw new Error(
            `Unable to upsert version ${translation.translationId}@${version.versionNumber}: ${versionError.message}`
          );
        }
      }
    }

    const resultPayload = {
      received: normalized.length,
      translationIds,
    };

    await service
      .from('translation_sync_runs')
      .update({
        failed_count: 0,
        finished_at: new Date().toISOString(),
        inserted_count: insertedCount,
        message: `Imported ${normalized.length} translations from upstream.`,
        result_payload: resultPayload,
        state: 'succeeded',
        updated_count: updatedCount,
        upstream_payload: payload,
      })
      .eq('id', syncRun.id);

    return {
      insertedCount,
      runId: syncRun.id,
      updatedCount,
    };
  } catch (error) {
    await service
      .from('translation_sync_runs')
      .update({
        failed_count: 1,
        finished_at: new Date().toISOString(),
        message: (error as Error).message,
        state: 'failed',
      })
      .eq('id', syncRun.id);

    throw error;
  }
}
