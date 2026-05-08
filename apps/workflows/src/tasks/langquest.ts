import { schedules, task } from '@trigger.dev/sdk';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  buildEveryBibleAudioPromotionManifest,
  classifyAudioKey,
  computeChecksum,
  orderSegmentRows,
  parseAssetVerseRange,
  type LangQuestChapterArtifactManifest,
  type LangQuestPromotionArtifactInput,
  type LangQuestSegmentInput,
} from '@everybible/langquest-ingest';

import { getWorkflowEnv } from '../lib/env';
import { createWorkflowServiceClient } from '../lib/supabase';

const LANGQUEST_DISCOVERY_TASK_ID = 'langquest-discover-candidates';

interface LangQuestDiscoveryPayload {
  workflowRunId?: string;
  source: 'manual' | 'scheduled';
}

interface LangQuestSelectedIngestPayload {
  chapterLimit?: number;
  selectedTranslationId?: string;
  workflowRunId?: string;
  source: 'manual' | 'scheduled';
}

interface LangQuestPromotionPayload {
  audioVersion?: string;
  publish?: boolean;
  selectedTranslationId?: string;
  translationIds?: string[];
  workflowRunId?: string;
  source: 'manual' | 'scheduled';
}

interface LangQuestQuestRow {
  id: string;
  metadata: Record<string, unknown> | null;
  project: {
    id: string;
    name: string;
    private: boolean;
    template: string;
    updated_at?: string | null;
    project_language_link?: Array<{
      language_type: string;
      languoid: {
        id: string;
        iso639_3: string | null;
        name: string;
      } | null;
    }>;
  } | null;
  updated_at: string | null;
}

interface EveryBibleSelectedRow {
  id: string;
  translation_id: string | null;
  candidate: {
    discovery_payload: Record<string, unknown> | null;
    id: string;
    language_code: string;
    language_name: string;
    langquest_project_id: string;
    langquest_project_name: string;
    langquest_source_identity: string;
  } | null;
}

interface PromotionSelectedRow {
  id: string;
  translation_id: string;
}

interface PromotionArtifactRow {
  book_id: string;
  chapter: number;
  id: string;
  manifest: unknown;
}

interface QuestAssetLinkRow {
  asset_id: string;
  quest_id: string;
}

interface AssetRow {
  created_at: string | null;
  id: string;
  metadata: unknown;
  name: string | null;
  order_index: number | null;
  source_asset_id: string | null;
}

interface AssetContentLinkRow {
  asset_id: string;
  audio: string[] | null;
  created_at: string | null;
  id: string;
  order_index: number | null;
  text: string | null;
}

interface ChapterQuest {
  book: string;
  chapter: number;
  id: string;
  name: string;
  updatedAt: string | null;
}

interface IngestSegment extends LangQuestSegmentInput {
  assetId: string;
  assetName: string;
  audioKey: string;
  contentLinkId: string;
  transcript: string | null;
}

type SupabaseQueryClient = {
  from(table: string): any;
};

function firstFromMaybeArray<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeLangQuestQuestRow(row: any): LangQuestQuestRow | null {
  const project = firstFromMaybeArray(row.project);
  if (!project) {
    return null;
  }

  return {
    id: row.id,
    metadata: row.metadata,
    project: {
      id: project.id,
      name: project.name,
      private: Boolean(project.private),
      project_language_link: (project.project_language_link ?? []).map((link: any) => ({
        language_type: link.language_type,
        languoid: firstFromMaybeArray(link.languoid),
      })),
      template: project.template,
      updated_at: project.updated_at,
    },
    updated_at: row.updated_at,
  };
}

function normalizeEveryBibleSelectedRow(row: any): EveryBibleSelectedRow | null {
  const candidate = firstFromMaybeArray(row.candidate);
  if (!candidate) {
    return null;
  }

  return {
    candidate,
    id: row.id,
    translation_id: row.translation_id ?? null,
  };
}

async function markWorkflowRun(
  workflowRunId: string | undefined,
  status: 'running' | 'succeeded' | 'failed',
  outputPayload: Record<string, unknown> = {}
) {
  if (!workflowRunId) {
    return;
  }

  const service = createWorkflowServiceClient();
  const patch: Record<string, unknown> = {
    status,
    output_payload: outputPayload,
  };

  if (status === 'running') {
    patch.started_at = new Date().toISOString();
  }

  if (status === 'succeeded' || status === 'failed') {
    patch.finished_at = new Date().toISOString();
  }

  const { error } = await service.from('workflow_runs').update(patch).eq('id', workflowRunId);

  if (error) {
    throw new Error(`Unable to update workflow run ${workflowRunId}: ${error.message}`);
  }
}

function getBibleMetadata(row: LangQuestQuestRow): { book: string; chapter: number } | null {
  const bible = row.metadata?.bible;
  if (!bible || typeof bible !== 'object') {
    return null;
  }

  const record = bible as Record<string, unknown>;
  const book = typeof record.book === 'string' ? record.book : null;
  const chapter = typeof record.chapter === 'number' ? record.chapter : Number(record.chapter);

  if (!book || !Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  return { book, chapter };
}

function requireR2Client(env: ReturnType<typeof getWorkflowEnv>): {
  bucket: string;
  client: S3Client;
} {
  if (!env.r2AccessKeyId || !env.r2Bucket || !env.r2Endpoint || !env.r2SecretAccessKey) {
    throw new Error(
      'R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required.'
    );
  }

  return {
    bucket: env.r2Bucket,
    client: new S3Client({
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
      endpoint: env.r2Endpoint,
      forcePathStyle: true,
      region: 'auto',
    }),
  };
}

function sourceStorageUrl(env: ReturnType<typeof getWorkflowEnv>, key: string): string {
  if (!env.langQuestSupabaseUrl || !env.langQuestStorageBucket) {
    throw new Error(
      'LANGQUEST_SUPABASE_URL and LANGQUEST_STORAGE_BUCKET are required for audio download.'
    );
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${env.langQuestSupabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${env.langQuestStorageBucket}/${encodedKey}`;
}

function fileExtension(key: string, contentType: string | null): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(key);
  if (match) {
    return match[1].toLowerCase();
  }

  if (contentType === 'audio/mp4') {
    return 'm4a';
  }

  if (contentType === 'audio/wav' || contentType === 'audio/x-wav') {
    return 'wav';
  }

  return 'mp3';
}

function normalizeBookId(book: string): string {
  return book.trim().toUpperCase();
}

function pad(value: number): string {
  return String(value).padStart(3, '0');
}

function defaultAudioVersion(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  return `${year}.${month}.${day}-segment-v1`;
}

function parseAssetMetadata(metadata: unknown): unknown {
  if (typeof metadata !== 'string') {
    return metadata;
  }

  try {
    return JSON.parse(metadata) as unknown;
  } catch {
    return null;
  }
}

function normalizeArtifactManifest(manifest: unknown): LangQuestChapterArtifactManifest {
  if (
    manifest &&
    typeof manifest === 'object' &&
    Array.isArray((manifest as { segments?: unknown }).segments)
  ) {
    return manifest as LangQuestChapterArtifactManifest;
  }

  return { segments: [] };
}

function firstCloudAudioKey(audio: string[] | null): string | null {
  for (const key of audio ?? []) {
    const classified = classifyAudioKey(key);
    if (classified.kind === 'cloud') {
      return classified.key;
    }
  }

  return null;
}

async function fetchChapters(
  langQuest: SupabaseQueryClient,
  projectId: string
): Promise<ChapterQuest[]> {
  const { data, error } = await langQuest
    .from('quest')
    .select('id, name, metadata, updated_at')
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Unable to load LangQuest chapters: ${error.message}`);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      metadata: Record<string, unknown> | null;
      name: string;
      updated_at: string | null;
    }>
  )
    .map((row) => {
      const bible = getBibleMetadata({
        id: row.id,
        metadata: row.metadata,
        project: null,
        updated_at: row.updated_at,
      });

      return bible
        ? {
            book: bible.book,
            chapter: bible.chapter,
            id: row.id,
            name: row.name,
            updatedAt: row.updated_at,
          }
        : null;
    })
    .filter((row): row is ChapterQuest => Boolean(row));
}

async function fetchSegmentsForChapter(
  langQuest: SupabaseQueryClient,
  quest: ChapterQuest,
  targetLanguoidId: string
): Promise<IngestSegment[]> {
  const { data: links, error: linksError } = await langQuest
    .from('quest_asset_link')
    .select('quest_id, asset_id')
    .eq('quest_id', quest.id);

  if (linksError) {
    throw new Error(`Unable to load quest_asset_link rows: ${linksError.message}`);
  }

  const assetIds = ((links ?? []) as QuestAssetLinkRow[]).map((link) => link.asset_id);
  if (assetIds.length === 0) {
    return [];
  }

  const [{ data: assets, error: assetsError }, { data: contentLinks, error: contentError }] =
    await Promise.all([
      langQuest
        .from('asset')
        .select('id, name, order_index, created_at, metadata, source_asset_id')
        .in('id', assetIds)
        .is('source_asset_id', null),
      langQuest
        .from('asset_content_link')
        .select('id, asset_id, order_index, created_at, text, audio')
        .in('asset_id', assetIds)
        .eq('languoid_id', targetLanguoidId),
    ]);

  if (assetsError) {
    throw new Error(`Unable to load LangQuest assets: ${assetsError.message}`);
  }

  if (contentError) {
    throw new Error(`Unable to load LangQuest content links: ${contentError.message}`);
  }

  const assetById = new Map(((assets ?? []) as AssetRow[]).map((asset) => [asset.id, asset]));
  const segments: IngestSegment[] = [];

  for (const contentLink of (contentLinks ?? []) as AssetContentLinkRow[]) {
    const asset = assetById.get(contentLink.asset_id);
    const audioKey = firstCloudAudioKey(contentLink.audio);
    if (!asset || !audioKey) {
      continue;
    }

    const parsedRange = parseAssetVerseRange(parseAssetMetadata(asset.metadata));
    const startVerse = parsedRange.ok ? parsedRange.range.startVerse : 1;
    const endVerse = parsedRange.ok ? parsedRange.range.endVerse : startVerse;

    segments.push({
      assetCreatedAt: asset.created_at,
      assetId: asset.id,
      assetName: asset.name ?? asset.id,
      assetOrderIndex: asset.order_index,
      audioKey,
      bookId: normalizeBookId(quest.book),
      byteLength: null,
      chapter: quest.chapter,
      checksum: null,
      contentLinkCreatedAt: contentLink.created_at,
      contentLinkId: contentLink.id,
      contentLinkOrderIndex: contentLink.order_index,
      endVerse,
      id: `${asset.id}:${contentLink.id}`,
      sourceKey: audioKey,
      startVerse,
      transcript: contentLink.text,
    });
  }

  return orderSegmentRows(segments);
}

async function ingestChapterArtifacts({
  env,
  langQuest,
  r2,
  selected,
  targetLanguoidId,
  quest,
  workflowRunId,
}: {
  env: ReturnType<typeof getWorkflowEnv>;
  langQuest: SupabaseQueryClient;
  quest: ChapterQuest;
  r2: ReturnType<typeof requireR2Client>;
  selected: EveryBibleSelectedRow;
  targetLanguoidId: string;
  workflowRunId?: string;
}): Promise<'ready' | 'not_ready'> {
  const segments = await fetchSegmentsForChapter(langQuest, quest, targetLanguoidId);
  const everyBible = createWorkflowServiceClient();
  const sourceChecksum = computeChecksum(
    JSON.stringify(
      segments.map((segment) => [segment.assetId, segment.contentLinkId, segment.audioKey]).sort()
    )
  );

  if (segments.length === 0) {
    await everyBible.from('langquest_chapter_artifacts').upsert(
      {
        artifact_state: 'not_ready',
        book_id: normalizeBookId(quest.book),
        chapter: quest.chapter,
        failure_reason: 'No resolvable cloud audio segments were found.',
        segment_count: 0,
        selected_translation_id: selected.id,
        source_asset_ids: [],
        source_checksum: sourceChecksum,
        workflow_run_id: workflowRunId ?? null,
      },
      { onConflict: 'selected_translation_id,book_id,chapter,source_checksum' }
    );
    return 'not_ready';
  }

  const prefix = `langquest/ingest/${selected.id}/${sourceChecksum}/chapters/${normalizeBookId(
    quest.book
  )}/${pad(quest.chapter)}`;
  const manifestSegments = [];

  for (const [index, segment] of segments.entries()) {
    const sourceResponse = await fetch(sourceStorageUrl(env, segment.audioKey));
    if (!sourceResponse.ok) {
      throw new Error(`Unable to download ${segment.audioKey}: HTTP ${sourceResponse.status}`);
    }

    const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
    const contentType =
      sourceResponse.headers.get('content-type') ?? segment.mimeType ?? 'audio/mpeg';
    const extension = fileExtension(segment.audioKey, contentType);
    const r2Key = `${prefix}/segments/${pad(index + 1)}-v${segment.startVerse}${
      segment.startVerse === segment.endVerse ? '' : `-${segment.endVerse}`
    }.${extension}`;

    await r2.client.send(
      new PutObjectCommand({
        Body: bytes,
        Bucket: r2.bucket,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentType: contentType,
        Key: r2Key,
      })
    );

    manifestSegments.push({
      asset_id: segment.assetId,
      asset_name: segment.assetName,
      byte_size: bytes.byteLength,
      canonical: true,
      content_link_id: segment.contentLinkId,
      content_type: contentType,
      r2_key: r2Key,
      seq: index + 1,
      sha256: computeChecksum(bytes),
      source_supabase_key: segment.audioKey,
      transcript: segment.transcript,
      verse_from: segment.startVerse,
      verse_to: segment.endVerse,
    });
  }

  const manifest = {
    chapter: {
      book: normalizeBookId(quest.book),
      chapter: quest.chapter,
      checksum: sourceChecksum,
      name: quest.name,
      quest_id: quest.id,
      updated_at: quest.updatedAt,
    },
    ingested_at: new Date().toISOString(),
    language: {
      code: selected.candidate?.language_code,
      name: selected.candidate?.language_name,
      target_languoid_id: targetLanguoidId,
    },
    project: {
      id: selected.candidate?.langquest_project_id,
      name: selected.candidate?.langquest_project_name,
    },
    schema_version: 1,
    segments: manifestSegments,
    source: {
      system: 'langquest',
      source_identity: selected.candidate?.langquest_source_identity,
    },
  };
  const manifestBody = JSON.stringify(manifest, null, 2);
  const manifestR2Key = `${prefix}/manifest.json`;

  await r2.client.send(
    new PutObjectCommand({
      Body: manifestBody,
      Bucket: r2.bucket,
      CacheControl: 'public, max-age=300, stale-while-revalidate=60',
      ContentType: 'application/json',
      Key: manifestR2Key,
    })
  );

  await everyBible.from('langquest_chapter_artifacts').upsert(
    {
      artifact_state: 'ready',
      book_id: normalizeBookId(quest.book),
      chapter: quest.chapter,
      manifest,
      manifest_r2_key: manifestR2Key,
      manifest_sha256: computeChecksum(manifestBody),
      processed_at: new Date().toISOString(),
      segment_count: manifestSegments.length,
      selected_translation_id: selected.id,
      source_asset_ids: segments.map((segment) => segment.assetId),
      source_checksum: sourceChecksum,
      workflow_run_id: workflowRunId ?? null,
    },
    { onConflict: 'selected_translation_id,book_id,chapter,source_checksum' }
  );

  return 'ready';
}

export const langquestDiscoverCandidatesTask = task({
  id: LANGQUEST_DISCOVERY_TASK_ID,
  run: async (payload: LangQuestDiscoveryPayload) => {
    await markWorkflowRun(payload.workflowRunId, 'running');

    const env = getWorkflowEnv();
    if (!env.langQuestSupabaseUrl || !env.langQuestSupabaseKey) {
      const message =
        'LANGQUEST_SUPABASE_URL and LANGQUEST_SUPABASE_SERVICE_ROLE_KEY are required for discovery.';
      await markWorkflowRun(payload.workflowRunId, 'failed', { error: message });
      throw new Error(message);
    }

    const langQuest = createClient(env.langQuestSupabaseUrl, env.langQuestSupabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let query = langQuest
      .from('quest')
      .select(
        `
          id,
          metadata,
          updated_at,
          project:project!inner(
            id,
            name,
            private,
            template,
            updated_at,
            project_language_link!inner(
              language_type,
              languoid:languoid!inner(id, name, iso639_3)
            )
          )
        `
      )
      .eq('project.template', 'bible')
      .eq('project.private', false)
      .eq('project.project_language_link.language_type', 'target');

    if (env.langQuestAllowedProjectIds.length > 0) {
      query = query.in('project.id', env.langQuestAllowedProjectIds);
    }

    const { data, error } = await query;
    if (error) {
      await markWorkflowRun(payload.workflowRunId, 'failed', { error: error.message });
      throw new Error(`Unable to discover LangQuest candidates: ${error.message}`);
    }

    const candidates = new Map<
      string,
      {
        bookIds: Set<string>;
        chapterCount: number;
        langquestProjectId: string;
        langquestProjectName: string;
        langquestTemplate: string;
        languageCode: string;
        languageName: string;
        sourceUpdatedAt: string | null;
        targetLanguoidId: string;
      }
    >();

    const questRows = ((data ?? []) as unknown[]).map(normalizeLangQuestQuestRow);
    for (const row of questRows) {
      if (!row) {
        continue;
      }

      const bible = getBibleMetadata(row);
      const project = row.project;
      const target = project?.project_language_link?.find(
        (link) => link.language_type === 'target' && link.languoid
      )?.languoid;

      if (!bible || !project || !target) {
        continue;
      }

      const sourceIdentity = `langquest:${project.id}:${target.id}`;
      const existing = candidates.get(sourceIdentity) ?? {
        bookIds: new Set<string>(),
        chapterCount: 0,
        langquestProjectId: project.id,
        langquestProjectName: project.name,
        langquestTemplate: project.template,
        languageCode: target.iso639_3 ?? target.id,
        languageName: target.name,
        sourceUpdatedAt: project.updated_at ?? row.updated_at,
        targetLanguoidId: target.id,
      };

      existing.bookIds.add(bible.book);
      existing.chapterCount += 1;
      if (
        row.updated_at &&
        (!existing.sourceUpdatedAt || row.updated_at > existing.sourceUpdatedAt)
      ) {
        existing.sourceUpdatedAt = row.updated_at;
      }
      candidates.set(sourceIdentity, existing);
    }

    const everyBible = createWorkflowServiceClient();
    const rows = [...candidates.entries()].map(([sourceIdentity, candidate]) => ({
      book_count: candidate.bookIds.size,
      chapter_count: candidate.chapterCount,
      discovery_payload: {
        targetLanguoidId: candidate.targetLanguoidId,
      },
      langquest_project_id: candidate.langquestProjectId,
      langquest_project_name: candidate.langquestProjectName,
      langquest_source_identity: sourceIdentity,
      langquest_template: candidate.langquestTemplate,
      language_code: candidate.languageCode,
      language_name: candidate.languageName,
      last_discovered_at: new Date().toISOString(),
      source_updated_at: candidate.sourceUpdatedAt,
      visibility: 'published',
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await everyBible
        .from('langquest_translation_candidates')
        .upsert(rows, { onConflict: 'langquest_source_identity' });

      if (upsertError) {
        await markWorkflowRun(payload.workflowRunId, 'failed', { error: upsertError.message });
        throw new Error(`Unable to upsert LangQuest candidates: ${upsertError.message}`);
      }
    }

    await markWorkflowRun(payload.workflowRunId, 'succeeded', {
      candidateCount: rows.length,
      source: payload.source,
    });

    return { candidateCount: rows.length };
  },
});

export const langquestSelectedIngestTask = task({
  id: 'langquest-selected-ingest',
  run: async (payload: LangQuestSelectedIngestPayload) => {
    await markWorkflowRun(payload.workflowRunId, 'running');
    const env = getWorkflowEnv();
    if (!env.langQuestSupabaseUrl || !env.langQuestSupabaseKey) {
      const message =
        'LANGQUEST_SUPABASE_URL and LANGQUEST_SUPABASE_SERVICE_ROLE_KEY are required for ingestion.';
      await markWorkflowRun(payload.workflowRunId, 'failed', { error: message });
      throw new Error(message);
    }

    const service = createWorkflowServiceClient();
    const selectedQuery = service
      .from('langquest_selected_translations')
      .select(
        `
          id,
          translation_id,
          selection_state,
          publish_state,
          candidate:langquest_translation_candidates!inner(
            id,
            langquest_project_id,
            langquest_project_name,
            langquest_source_identity,
            language_code,
            language_name,
            discovery_payload
          )
        `
      )
      .eq('selection_state', 'selected');

    if (payload.selectedTranslationId) {
      selectedQuery.eq('id', payload.selectedTranslationId);
    }

    const { data, error } = await selectedQuery;

    if (error) {
      await markWorkflowRun(payload.workflowRunId, 'failed', { error: error.message });
      throw new Error(`Unable to load selected LangQuest translations: ${error.message}`);
    }

    const langQuest = createClient(env.langQuestSupabaseUrl, env.langQuestSupabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const r2 = requireR2Client(env);
    const selectedRows = ((data ?? []) as unknown[])
      .map(normalizeEveryBibleSelectedRow)
      .filter((row): row is EveryBibleSelectedRow => Boolean(row));
    let readyChapters = 0;
    let notReadyChapters = 0;

    for (const selected of selectedRows) {
      const targetLanguoidId =
        typeof selected.candidate?.discovery_payload?.targetLanguoidId === 'string'
          ? selected.candidate.discovery_payload.targetLanguoidId
          : null;

      if (!selected.candidate || !targetLanguoidId) {
        continue;
      }

      const chapters = await fetchChapters(langQuest, selected.candidate.langquest_project_id);
      const limitedChapters =
        payload.chapterLimit && payload.chapterLimit > 0
          ? chapters.slice(0, payload.chapterLimit)
          : chapters;

      for (const quest of limitedChapters) {
        const result = await ingestChapterArtifacts({
          env,
          langQuest,
          quest,
          r2,
          selected,
          targetLanguoidId,
          workflowRunId: payload.workflowRunId,
        });

        if (result === 'ready') {
          readyChapters += 1;
        } else {
          notReadyChapters += 1;
        }
      }
    }

    await markWorkflowRun(payload.workflowRunId, 'succeeded', {
      notReadyChapters,
      readyChapters,
      selectedCount: selectedRows.length,
      source: payload.source,
    });

    return { notReadyChapters, readyChapters, selectedCount: selectedRows.length };
  },
});

export const langquestPromoteAudioManifestTask = task({
  id: 'langquest-promote-audio-manifest',
  run: async (payload: LangQuestPromotionPayload) => {
    await markWorkflowRun(payload.workflowRunId, 'running');

    const env = getWorkflowEnv();
    const r2 = requireR2Client(env);
    const service = createWorkflowServiceClient();
    const audioVersion = payload.audioVersion ?? defaultAudioVersion();
    const targetPublishState = payload.publish ? 'published' : 'ready';

    let selectedQuery = service
      .from('langquest_selected_translations')
      .select('id, translation_id, publish_state, selection_state')
      .eq('selection_state', 'selected')
      .eq('publish_state', 'approved')
      .not('translation_id', 'is', null);

    if (payload.selectedTranslationId) {
      selectedQuery = selectedQuery.eq('id', payload.selectedTranslationId);
    }

    if (payload.translationIds && payload.translationIds.length > 0) {
      selectedQuery = selectedQuery.in('translation_id', payload.translationIds);
    }

    const { data: selectedData, error: selectedError } = await selectedQuery;
    if (selectedError) {
      await markWorkflowRun(payload.workflowRunId, 'failed', { error: selectedError.message });
      throw new Error(`Unable to load approved LangQuest translations: ${selectedError.message}`);
    }

    const selectedRows = (
      (selectedData ?? []) as Array<{ id: string; translation_id: string | null }>
    ).filter((row): row is PromotionSelectedRow => Boolean(row.translation_id));
    const promoted: Array<{
      artifactCount: number;
      manifestR2Key: string;
      manifestSha256: string;
      segmentCount: number;
      selectedTranslationId: string;
      translationId: string;
    }> = [];

    for (const selected of selectedRows) {
      const { data: artifactsData, error: artifactsError } = await service
        .from('langquest_chapter_artifacts')
        .select('id, book_id, chapter, manifest')
        .eq('selected_translation_id', selected.id)
        .eq('artifact_state', 'ready')
        .in('publish_state', ['candidate', 'ready', 'approved']);

      if (artifactsError) {
        await markWorkflowRun(payload.workflowRunId, 'failed', { error: artifactsError.message });
        throw new Error(`Unable to load ready LangQuest artifacts: ${artifactsError.message}`);
      }

      const artifacts: LangQuestPromotionArtifactInput[] = (
        (artifactsData ?? []) as PromotionArtifactRow[]
      )
        .map((artifact) => ({
          bookId: artifact.book_id,
          chapter: artifact.chapter,
          id: artifact.id,
          manifest: normalizeArtifactManifest(artifact.manifest),
        }))
        .filter((artifact) => (artifact.manifest.segments?.length ?? 0) > 0);

      if (artifacts.length === 0) {
        continue;
      }

      const manifest = buildEveryBibleAudioPromotionManifest({
        artifacts,
        audioVersion,
        translationId: selected.translation_id,
        updatedAt: new Date().toISOString(),
      });
      const manifestBody = JSON.stringify(manifest, null, 2);
      const manifestSha256 = computeChecksum(manifestBody);
      const manifestR2Key = `manifests/audio/${selected.translation_id}/${audioVersion}.json`;

      await r2.client.send(
        new PutObjectCommand({
          Body: manifestBody,
          Bucket: r2.bucket,
          CacheControl: payload.publish
            ? 'public, max-age=300, stale-while-revalidate=60'
            : 'private, max-age=60',
          ContentType: 'application/json',
          Key: manifestR2Key,
        })
      );

      const publishedAt = payload.publish ? new Date().toISOString() : null;
      const artifactIds = artifacts.map((artifact) => artifact.id);
      const { error: artifactsUpdateError } = await service
        .from('langquest_chapter_artifacts')
        .update({
          publish_state: targetPublishState,
          published_at: publishedAt,
        })
        .in('id', artifactIds);

      if (artifactsUpdateError) {
        await markWorkflowRun(payload.workflowRunId, 'failed', {
          error: artifactsUpdateError.message,
        });
        throw new Error(`Unable to update LangQuest artifacts: ${artifactsUpdateError.message}`);
      }

      const selectedPatch: Record<string, unknown> = {
        manifest_schema_version: 'everybible-audio-segment-manifest/v1',
        publish_state: targetPublishState,
        r2_prefix: `manifests/audio/${selected.translation_id}`,
      };
      if (payload.publish) {
        selectedPatch.published_at = publishedAt;
      }

      const { error: selectedUpdateError } = await service
        .from('langquest_selected_translations')
        .update(selectedPatch)
        .eq('id', selected.id);

      if (selectedUpdateError) {
        await markWorkflowRun(payload.workflowRunId, 'failed', {
          error: selectedUpdateError.message,
        });
        throw new Error(
          `Unable to update LangQuest selected translation: ${selectedUpdateError.message}`
        );
      }

      promoted.push({
        artifactCount: artifacts.length,
        manifestR2Key,
        manifestSha256,
        segmentCount: manifest.totalSegments,
        selectedTranslationId: selected.id,
        translationId: selected.translation_id,
      });
    }

    await markWorkflowRun(payload.workflowRunId, 'succeeded', {
      audioVersion,
      deliveryMode: 'segment',
      promoted,
      promotedCount: promoted.length,
      publishState: targetPublishState,
      source: payload.source,
      translationCatalogUpdated: false,
    });

    return {
      audioVersion,
      deliveryMode: 'segment' as const,
      promoted,
      promotedCount: promoted.length,
      publishState: targetPublishState,
      translationCatalogUpdated: false,
    };
  },
});

export const langquestDailySelectedIngestTask = schedules.task({
  id: 'langquest-daily-selected-ingest',
  cron: {
    pattern: '0 2 * * *',
    timezone: 'UTC',
    environments: ['PRODUCTION', 'STAGING'],
  },
  run: async () => {
    return langquestSelectedIngestTask.trigger({
      source: 'scheduled',
    });
  },
});

export const langquestDailyDiscoveryTask = schedules.task({
  id: 'langquest-daily-discovery',
  cron: {
    pattern: '30 1 * * *',
    timezone: 'UTC',
    environments: ['PRODUCTION', 'STAGING'],
  },
  run: async () => {
    return langquestDiscoverCandidatesTask.trigger({
      source: 'scheduled',
    });
  },
});
