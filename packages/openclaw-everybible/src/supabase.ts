import type { HomepageContentOverridePayload, OperatorAuditMetadata } from '@everybible/types';
import { createClient } from '@supabase/supabase-js';

import { getEveryBibleOperatorEnv } from './env';

export interface HomepageOverrideEntry {
  content: HomepageContentOverridePayload | null;
  id: string;
  publishedAt: string | null;
  slug: string;
  state: 'draft' | 'live' | 'archived';
  updatedAt: string;
}

export interface RecentAdminAction {
  action: string;
  actorEmail: string | null;
  createdAt: string;
  entityId: string | null;
  entityType: string;
  id: string;
  summary: string;
}

export interface TranslationSummary {
  distributionCounts: Record<string, number>;
  recentTranslations: Array<{
    distributionState: string;
    languageName: string;
    name: string;
    translationId: string;
    updatedAt: string;
  }>;
  totalTranslations: number;
}

export interface ContentHealthSummary {
  failedSyncCount: number;
  liveHomepageOverride: boolean;
  liveImageCount: number;
  liveVerseCount: number;
}

interface WindowedStateRow {
  ends_at: string | null;
  starts_at: string | null;
  state: string;
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

export function createEveryBibleOperatorClient() {
  const env = getEveryBibleOperatorEnv();

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getHomepageOverrideEntry(): Promise<HomepageOverrideEntry | null> {
  const service = createEveryBibleOperatorClient();
  const { data, error } = await service
    .from('site_content_entries')
    .select('id, slug, state, content, published_at, updated_at')
    .eq('slug', 'homepage')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<{
      content: HomepageContentOverridePayload | null;
      id: string;
      published_at: string | null;
      slug: string;
      state: 'draft' | 'live' | 'archived';
      updated_at: string;
    }>();

  if (error) {
    throw new Error(`Unable to load homepage override: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    content: data.content,
    id: data.id,
    publishedAt: data.published_at,
    slug: data.slug,
    state: data.state,
    updatedAt: data.updated_at,
  };
}

export async function updateHomepageOverride(params: {
  channel: string | null;
  changedFields: string[];
  payload: HomepageContentOverridePayload;
  requesterDisplayName: string | null;
  requesterSenderId: string | null;
  summary: string;
  toolName: string;
}): Promise<HomepageOverrideEntry> {
  const service = createEveryBibleOperatorClient();
  const now = new Date().toISOString();

  const { data, error } = await service
    .from('site_content_entries')
    .upsert(
      {
        slug: 'homepage',
        state: 'live',
        content: params.payload,
        published_at: now,
        updated_by: null,
      },
      { onConflict: 'slug' }
    )
    .select('id, slug, state, content, published_at, updated_at')
    .single<{
      content: HomepageContentOverridePayload | null;
      id: string;
      published_at: string | null;
      slug: string;
      state: 'draft' | 'live' | 'archived';
      updated_at: string;
    }>();

  if (error) {
    throw new Error(`Unable to update homepage override: ${error.message}`);
  }

  const metadata: OperatorAuditMetadata = {
    actorSource: 'openclaw',
    channel: params.channel,
    changedFields: params.changedFields,
    requesterDisplayName: params.requesterDisplayName,
    requesterSenderId: params.requesterSenderId,
    targetSlug: 'homepage',
    toolName: params.toolName,
  };

  const { error: auditError } = await service.from('admin_audit_logs').insert({
    actor_user_id: null,
    actor_email: params.requesterSenderId
      ? `openclaw:${params.requesterSenderId}`
      : 'openclaw:owner',
    action: 'homepage_content_updated',
    entity_type: 'site_content_entry',
    entity_id: 'homepage',
    summary: params.summary,
    metadata,
  });

  if (auditError) {
    throw new Error(`Homepage updated, but audit log insert failed: ${auditError.message}`);
  }

  return {
    content: data.content,
    id: data.id,
    publishedAt: data.published_at,
    slug: data.slug,
    state: data.state,
    updatedAt: data.updated_at,
  };
}

export async function getContentHealthSummary(): Promise<ContentHealthSummary> {
  const service = createEveryBibleOperatorClient();

  const [failedSyncs, liveVerses, liveImages, homepageOverride] = await Promise.all([
    service
      .from('translation_sync_runs')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'failed'),
    service.from('verse_of_day_entries').select('state, starts_at, ends_at'),
    service.from('content_images').select('state, starts_at, ends_at'),
    getHomepageOverrideEntry(),
  ]);

  if (failedSyncs.error) {
    throw new Error(`Unable to load failed sync count: ${failedSyncs.error.message}`);
  }

  if (liveVerses.error) {
    throw new Error(`Unable to load verse health summary: ${liveVerses.error.message}`);
  }

  if (liveImages.error) {
    throw new Error(`Unable to load image health summary: ${liveImages.error.message}`);
  }

  const liveVerseCount = ((liveVerses.data ?? []) as WindowedStateRow[]).filter((entry) => {
    return entry.state === 'live' && isWithinWindow(entry.starts_at, entry.ends_at);
  }).length;

  const liveImageCount = ((liveImages.data ?? []) as WindowedStateRow[]).filter((entry) => {
    return entry.state === 'live' && isWithinWindow(entry.starts_at, entry.ends_at);
  }).length;

  return {
    failedSyncCount: failedSyncs.count ?? 0,
    liveHomepageOverride: homepageOverride?.state === 'live',
    liveImageCount,
    liveVerseCount,
  };
}

export async function getTranslationSummary(): Promise<TranslationSummary> {
  const service = createEveryBibleOperatorClient();
  const { data, error } = await service
    .from('translation_catalog')
    .select('translation_id, name, language_name, distribution_state, updated_at')
    .order('updated_at', { ascending: false })
    .limit(250);

  if (error) {
    throw new Error(`Unable to load translation summary: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    distribution_state: string;
    language_name: string;
    name: string;
    translation_id: string;
    updated_at: string;
  }>;

  const distributionCounts = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.distribution_state] = (accumulator[row.distribution_state] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    distributionCounts,
    recentTranslations: rows.slice(0, 8).map((row) => ({
      distributionState: row.distribution_state,
      languageName: row.language_name,
      name: row.name,
      translationId: row.translation_id,
      updatedAt: row.updated_at,
    })),
    totalTranslations: rows.length,
  };
}

export async function getRecentAdminActions(limit = 10): Promise<RecentAdminAction[]> {
  const service = createEveryBibleOperatorClient();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 25)) : 10;
  const { data, error } = await service
    .from('admin_audit_logs')
    .select('id, action, actor_email, entity_type, entity_id, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Unable to load recent admin actions: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    action: string;
    actor_email: string | null;
    created_at: string;
    entity_id: string | null;
    entity_type: string;
    id: string;
    summary: string;
  }>).map((row) => ({
    action: row.action,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
    entityId: row.entity_id,
    entityType: row.entity_type,
    id: row.id,
    summary: row.summary,
  }));
}
