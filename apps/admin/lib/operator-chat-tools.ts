import { revalidatePath } from 'next/cache';

import type { OperatorChatContext } from './operator-chat';

import {
  getDashboardSummary,
  getAnalyticsOverview,
  getHealthIssues,
  getRecentAuditLogs,
  getRecentOperatorAuditLogs,
  getContentImageDetail,
  listContentImages,
  getSupportUserDetail,
  getTranslationDetail,
  listSyncRuns,
  listSupportUsers,
  listTranslations,
  getVerseOfDayDetail,
  listVerseOfDayEntries,
} from './admin-data';
import { writeAdminAuditLog } from './audit-log';
import { createAdminServiceClient } from './supabase/service';
import { runUpstreamTranslationSync } from './upstream-sync';

export interface OperatorChatToolCall {
  arguments: Record<string, unknown>;
  id: string;
  name: string;
}

export interface OperatorChatToolDefinition {
  function: {
    description: string;
    name: string;
    parameters: Record<string, unknown>;
  };
  type: 'function';
}

const MAX_SEARCH_RESULTS = 20;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asOptionalString(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInteger(value: unknown, fallback: number, ceiling = 25): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1) {
    return fallback;
  }

  return Math.min(normalized, ceiling);
}

function emptyObjectSchema(description: string): Record<string, unknown> {
  return {
    additionalProperties: false,
    description,
    properties: {},
    type: 'object',
  };
}

function stringParameter(description: string) {
  return {
    description,
    type: 'string',
  };
}

function integerParameter(description: string, maximum = 25) {
  return {
    description,
    maximum,
    minimum: 1,
    type: 'integer',
  };
}

function booleanParameter(description: string) {
  return {
    description,
    type: 'boolean',
  };
}

function enumParameter(description: string, values: readonly string[]) {
  return {
    description,
    enum: [...values],
    type: 'string',
  };
}

function parseOptionalDateTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return null;
}

function asEnumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T
): T {
  const trimmed = asTrimmedString(value);
  return (values as readonly string[]).includes(trimmed) ? (trimmed as T) : fallback;
}

function summarizeVerseOfDayEntries(entries: Awaited<ReturnType<typeof listVerseOfDayEntries>>) {
  return entries.map((entry) => ({
    createdAt: entry.createdAt,
    id: entry.id,
    referenceLabel: entry.referenceLabel,
    startsAt: entry.startsAt,
    state: entry.state,
    title: entry.title,
    translationId: entry.translationId,
    updatedAt: entry.updatedAt,
  }));
}

function summarizeContentImages(entries: Awaited<ReturnType<typeof listContentImages>>) {
  return entries.map((entry) => ({
    altText: entry.alt_text,
    id: entry.id,
    kind: entry.kind,
    publicUrl: entry.public_url,
    startsAt: entry.starts_at,
    state: entry.state,
    title: entry.title,
    updatedAt: entry.updated_at,
  }));
}

export function buildOperatorChatTools(): OperatorChatToolDefinition[] {
  return [
    {
      function: {
        description:
          'Get a live dashboard snapshot with health issues, recent admin actions, recent operator actions, and recent sync runs.',
        name: 'inspect_dashboard',
        parameters: emptyObjectSchema('Inspect the live admin dashboard snapshot.'),
      },
      type: 'function',
    },
    {
      function: {
        description: 'Inspect the active health issues that the dashboard is surfacing right now.',
        name: 'get_health_issues',
        parameters: emptyObjectSchema('Inspect live health issues.'),
      },
      type: 'function',
    },
    {
      function: {
        description: 'Load the current admin analytics overview, including listening, downloads, and country activity.',
        name: 'get_analytics_overview',
        parameters: emptyObjectSchema('Inspect the live analytics overview.'),
      },
      type: 'function',
    },
    {
      function: {
        description: 'Search translations by id, name, abbreviation, or language name.',
        name: 'search_translations',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of results to return.', MAX_SEARCH_RESULTS),
            query: stringParameter('Optional search text.'),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Get one live translation record with versions and recent sync runs.',
        name: 'get_translation',
        parameters: {
          additionalProperties: false,
          properties: {
            translationId: stringParameter('The translation id to inspect.'),
          },
          required: ['translationId'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Update the EveryBible-local translation metadata for a catalog entry.',
        name: 'update_translation_metadata',
        parameters: {
          additionalProperties: false,
          properties: {
            adminNotes: stringParameter('Optional internal notes to store on the translation.'),
            distributionState: enumParameter(
              'Optional local distribution state.',
              ['draft', 'ready', 'published', 'hidden']
            ),
            isAvailable: booleanParameter(
              'Optional local visibility flag. If omitted, the current value is preserved.'
            ),
            translationId: stringParameter('The translation id to update.'),
          },
          required: ['translationId'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Search support users by email or display name.',
        name: 'search_users',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of results to return.', MAX_SEARCH_RESULTS),
            query: stringParameter('Optional search text.'),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Get one support user with preferences, engagement, devices, and recent audit logs.',
        name: 'get_user',
        parameters: {
          additionalProperties: false,
          properties: {
            userId: stringParameter('The user id to inspect.'),
          },
          required: ['userId'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'List recent admin audit log rows from the dashboard.',
        name: 'list_recent_admin_audit_logs',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of log rows to return.', MAX_SEARCH_RESULTS),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'List recent operator audit log rows from the OpenClaw/operator channel.',
        name: 'list_recent_operator_audit_logs',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of log rows to return.', MAX_SEARCH_RESULTS),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'List recent translation sync runs.',
        name: 'list_sync_runs',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of sync runs to return.', MAX_SEARCH_RESULTS),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description:
          'Run the upstream translation sync and write an admin audit log for the action.',
        name: 'run_translation_sync',
        parameters: emptyObjectSchema('Run the upstream translation sync.'),
      },
      type: 'function',
    },
    {
      function: {
        description: 'List verse-of-day entries and their publication state.',
        name: 'list_verse_of_day_entries',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of entries to return.', MAX_SEARCH_RESULTS),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Inspect one verse-of-the-day entry with its scheduling window and snapshot details.',
        name: 'get_verse_of_day_entry',
        parameters: {
          additionalProperties: false,
          properties: {
            id: stringParameter('The verse-of-day entry id to inspect.'),
          },
          required: ['id'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Create or update a verse-of-the-day entry and keep the stored verse snapshot aligned.',
        name: 'save_verse_of_day',
        parameters: {
          additionalProperties: false,
          properties: {
            bookId: stringParameter('The book id for the verse snapshot.'),
            chapter: integerParameter('The verse chapter.', 999),
            endsAt: stringParameter('Optional ISO date string or datetime-local value.'),
            id: stringParameter('Optional entry id to upsert into an existing row.'),
            imageId: stringParameter('Optional related content image id.'),
            reflection: stringParameter('Optional reflection text.'),
            startsAt: stringParameter('Optional ISO date string or datetime-local value.'),
            state: enumParameter('Optional publication state.', ['draft', 'scheduled', 'live', 'archived']),
            title: stringParameter('Optional internal title.'),
            translationId: stringParameter('The translation id for the verse snapshot.'),
            verse: integerParameter('The verse number.', 999),
          },
          required: ['translationId', 'bookId', 'chapter', 'verse'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Archive a verse-of-the-day entry.',
        name: 'archive_verse_of_day',
        parameters: {
          additionalProperties: false,
          properties: {
            id: stringParameter('The verse-of-day entry id to archive.'),
          },
          required: ['id'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'List content images and their current publication state.',
        name: 'list_content_images',
        parameters: {
          additionalProperties: false,
          properties: {
            limit: integerParameter('Maximum number of entries to return.', MAX_SEARCH_RESULTS),
          },
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Inspect one content image record with its stored scheduling window and caption.',
        name: 'get_content_image',
        parameters: {
          additionalProperties: false,
          properties: {
            id: stringParameter('The content image id to inspect.'),
          },
          required: ['id'],
          type: 'object',
        },
      },
      type: 'function',
    },
    {
      function: {
        description: 'Update an existing content image record without touching the upload itself.',
        name: 'update_content_image',
        parameters: {
          additionalProperties: false,
          properties: {
            altText: stringParameter('Optional alt text to store.'),
            caption: stringParameter('Optional caption or internal note.'),
            endsAt: stringParameter('Optional ISO date string or datetime-local value.'),
            id: stringParameter('The content image id to update.'),
            startsAt: stringParameter('Optional ISO date string or datetime-local value.'),
            state: enumParameter('Optional publication state.', ['draft', 'scheduled', 'live', 'archived']),
            title: stringParameter('Optional image title.'),
          },
          required: ['id'],
          type: 'object',
        },
      },
      type: 'function',
    },
  ];
}

export async function executeOperatorChatTool(
  call: OperatorChatToolCall,
  context: OperatorChatContext
): Promise<unknown> {
  switch (call.name) {
    case 'inspect_dashboard': {
      const [
        dashboardSummary,
        healthIssues,
        analyticsOverview,
        recentAdminActions,
        recentOperatorActions,
        recentSyncRuns,
      ] = await Promise.all([
        getDashboardSummary(),
        getHealthIssues(),
        getAnalyticsOverview(),
        getRecentAuditLogs(8),
        getRecentOperatorAuditLogs(8),
        listSyncRuns(5),
      ]);

      return {
        dashboardSummary,
        analyticsOverview,
        generatedAt: new Date().toISOString(),
        healthIssues,
        recentAdminActions,
        recentOperatorActions,
        recentSyncRuns,
      };
    }

    case 'get_health_issues': {
      const issues = await getHealthIssues();
      return { issues };
    }

    case 'get_analytics_overview': {
      const analytics = await getAnalyticsOverview();
      return {
        analytics: {
          ...analytics,
          countryMetrics: analytics.countryMetrics.slice(0, 10),
          dailyDownloadUnits: analytics.dailyDownloadUnits.slice(0, 30),
          dailyListeningMinutes: analytics.dailyListeningMinutes.slice(0, 30),
        },
      };
    }

    case 'search_translations': {
      const query = asTrimmedString(call.arguments.query);
      const limit = asPositiveInteger(call.arguments.limit, 12, MAX_SEARCH_RESULTS);
      const results = await listTranslations(query || undefined);

      return {
        limit,
        query,
        results: results.slice(0, limit),
      };
    }

    case 'update_translation_metadata': {
      const translationId = asTrimmedString(call.arguments.translationId);
      if (!translationId) {
        return { error: 'translationId is required.' };
      }

      const translation = await getTranslationDetail(translationId);
      if (!translation) {
        return { error: `Translation ${translationId} was not found.` };
      }

      const distributionState = asEnumValue(
        call.arguments.distributionState,
        ['draft', 'ready', 'published', 'hidden'] as const,
        translation.distributionState
      );
      const adminNotes = asOptionalString(call.arguments.adminNotes) ?? translation.adminNotes;
      const isAvailable =
        parseOptionalBoolean(call.arguments.isAvailable) ?? translation.isAvailable;

      const service = createAdminServiceClient();
      const { error } = await service
        .from('translation_catalog')
        .update({
          admin_notes: adminNotes,
          distribution_state: distributionState,
          is_available: isAvailable,
        })
        .eq('translation_id', translationId);

      if (error) {
        return { error: `Unable to update translation metadata: ${error.message}` };
      }

      await writeAdminAuditLog({
        action: 'translation.metadata.update',
        actorEmail: context.adminEmail,
        actorUserId: context.adminId,
        entityId: translationId,
        entityType: 'translation',
        metadata: {
          adminNotes,
          distributionState,
          isAvailable,
        },
        summary: `Updated EveryBible-local metadata for ${translationId}.`,
      });

      revalidatePath('/translations');
      revalidatePath(`/translations/${translationId}`);
      revalidatePath('/health');
      revalidatePath('/');

      return {
        message: `Updated translation metadata for ${translationId}.`,
        translation: {
          adminNotes,
          distributionState,
          isAvailable,
          translationId,
        },
      };
    }

    case 'get_translation': {
      const translationId = asTrimmedString(call.arguments.translationId);
      if (!translationId) {
        return { error: 'translationId is required.' };
      }

      const translation = await getTranslationDetail(translationId);
      if (!translation) {
        return { error: `Translation ${translationId} was not found.` };
      }

      return {
        translation: {
          ...translation,
          versions: translation.versions.slice(0, 10),
        },
      };
    }

    case 'search_users': {
      const query = asTrimmedString(call.arguments.query);
      const limit = asPositiveInteger(call.arguments.limit, 12, MAX_SEARCH_RESULTS);
      const results = await listSupportUsers(query || undefined);

      return {
        limit,
        query,
        results: results.slice(0, limit),
      };
    }

    case 'get_user': {
      const userId = asTrimmedString(call.arguments.userId);
      if (!userId) {
        return { error: 'userId is required.' };
      }

      const user = await getSupportUserDetail(userId);
      if (!user) {
        return { error: `User ${userId} was not found.` };
      }

      return { user };
    }

    case 'list_recent_admin_audit_logs': {
      const limit = asPositiveInteger(call.arguments.limit, 10, MAX_SEARCH_RESULTS);
      const logs = await getRecentAuditLogs(limit);

      return {
        limit,
        logs,
      };
    }

    case 'list_recent_operator_audit_logs': {
      const limit = asPositiveInteger(call.arguments.limit, 10, MAX_SEARCH_RESULTS);
      const logs = await getRecentOperatorAuditLogs(limit);

      return {
        limit,
        logs,
      };
    }

    case 'list_sync_runs': {
      const limit = asPositiveInteger(call.arguments.limit, 5, MAX_SEARCH_RESULTS);
      const runs = await listSyncRuns(limit);

      return {
        limit,
        runs,
      };
    }

    case 'run_translation_sync': {
      const result = await runUpstreamTranslationSync(context.adminId);

      await writeAdminAuditLog({
        action: 'translation.sync.run',
        actorEmail: context.adminEmail,
        actorUserId: context.adminId,
        entityId: result.runId,
        entityType: 'translation_sync_run',
        metadata: result,
        summary: `Triggered upstream translation sync (${result.insertedCount} inserted, ${result.updatedCount} updated).`,
      });

      revalidatePath('/');
      revalidatePath('/translations');
      revalidatePath('/health');

      return {
        message: 'Translation sync completed successfully.',
        ...result,
      };
    }

    case 'list_verse_of_day_entries': {
      const limit = asPositiveInteger(call.arguments.limit, 12, MAX_SEARCH_RESULTS);
      const entries = await listVerseOfDayEntries();

      return {
        limit,
        results: summarizeVerseOfDayEntries(entries).slice(0, limit),
      };
    }

    case 'get_verse_of_day_entry': {
      const id = asTrimmedString(call.arguments.id);
      if (!id) {
        return { error: 'id is required.' };
      }

      const entry = await getVerseOfDayDetail(id);
      if (!entry) {
        return { error: `Verse-of-day entry ${id} was not found.` };
      }

      return { entry };
    }

    case 'save_verse_of_day': {
      const translationId = asTrimmedString(call.arguments.translationId);
      const bookId = asTrimmedString(call.arguments.bookId);
      const chapter = asPositiveInteger(call.arguments.chapter, 0, 999);
      const verse = asPositiveInteger(call.arguments.verse, 0, 999);

      if (!translationId || !bookId || chapter < 1 || verse < 1) {
        return {
          error: 'translationId, bookId, chapter, and verse are required.',
        };
      }

      const existingId = asTrimmedString(call.arguments.id);
      const existing = existingId ? await getVerseOfDayDetail(existingId) : null;
      const service = createAdminServiceClient();
      const snapshot = await service
        .from('bible_verses')
        .select('text')
        .eq('translation_id', translationId)
        .eq('book_id', bookId)
        .eq('chapter', chapter)
        .eq('verse', verse)
        .maybeSingle<{ text: string }>();

      if (snapshot.error) {
        return { error: `Unable to load verse snapshot: ${snapshot.error.message}` };
      }

      if (!snapshot.data) {
        return { error: 'That verse is not present in the synced Bible library yet.' };
      }

      const payload = {
        book_id: bookId,
        chapter,
        created_by: existing ? undefined : context.adminId,
        ends_at: parseOptionalDateTime(call.arguments.endsAt) ?? existing?.endsAt ?? null,
        id: existingId || undefined,
        image_id: asOptionalString(call.arguments.imageId) ?? existing?.imageId ?? null,
        reflection: asOptionalString(call.arguments.reflection) ?? existing?.reflection ?? null,
        reference_label: `${bookId} ${chapter}:${verse} (${translationId})`,
        starts_at: parseOptionalDateTime(call.arguments.startsAt) ?? existing?.startsAt ?? null,
        state: asEnumValue(
          call.arguments.state,
          ['draft', 'scheduled', 'live', 'archived'] as const,
          existing?.state ?? 'draft'
        ),
        title: asOptionalString(call.arguments.title) ?? existing?.title ?? null,
        translation_id: translationId,
        updated_by: context.adminId,
        verse,
        verse_text: snapshot.data.text,
      };

      const { data, error } = await service
        .from('verse_of_day_entries')
        .upsert(payload)
        .select('id')
        .single<{ id: string }>();

      if (error || !data) {
        return { error: error?.message ?? 'Unable to save verse-of-day entry.' };
      }

      await writeAdminAuditLog({
        action: 'verse_of_day.upsert',
        actorEmail: context.adminEmail,
        actorUserId: context.adminId,
        entityId: data.id,
        entityType: 'verse_of_day_entry',
        metadata: {
          bookId,
          chapter,
          state: payload.state,
          translationId,
          verse,
        },
        summary: `Saved verse-of-the-day entry ${bookId} ${chapter}:${verse} (${translationId}).`,
      });

      revalidatePath('/content/verse-of-day');
      revalidatePath('/health');
      revalidatePath('/');

      return {
        entryId: data.id,
        message: 'Verse of the Day entry saved.',
        referenceLabel: payload.reference_label,
      };
    }

    case 'archive_verse_of_day': {
      const id = asTrimmedString(call.arguments.id);
      if (!id) {
        return { error: 'id is required.' };
      }

      const service = createAdminServiceClient();
      const { error } = await service
        .from('verse_of_day_entries')
        .update({ state: 'archived', updated_by: context.adminId })
        .eq('id', id);

      if (error) {
        return { error: `Unable to archive verse-of-day entry: ${error.message}` };
      }

      await writeAdminAuditLog({
        action: 'verse_of_day.archive',
        actorEmail: context.adminEmail,
        actorUserId: context.adminId,
        entityId: id,
        entityType: 'verse_of_day_entry',
        summary: 'Archived a verse-of-the-day entry.',
      });

      revalidatePath('/content/verse-of-day');
      revalidatePath('/health');
      revalidatePath('/');

      return {
        message: `Archived verse-of-day entry ${id}.`,
      };
    }

    case 'list_content_images': {
      const limit = asPositiveInteger(call.arguments.limit, 12, MAX_SEARCH_RESULTS);
      const entries = await listContentImages();

      return {
        limit,
        results: summarizeContentImages(entries).slice(0, limit),
      };
    }

    case 'get_content_image': {
      const id = asTrimmedString(call.arguments.id);
      if (!id) {
        return { error: 'id is required.' };
      }

      const image = await getContentImageDetail(id);
      if (!image) {
        return { error: `Content image ${id} was not found.` };
      }

      return { image };
    }

    case 'update_content_image': {
      const id = asTrimmedString(call.arguments.id);
      if (!id) {
        return { error: 'id is required.' };
      }

      const existing = await getContentImageDetail(id);
      if (!existing) {
        return { error: `Content image ${id} was not found.` };
      }

      const payload = {
        alt_text: asOptionalString(call.arguments.altText) ?? existing.altText,
        caption: asOptionalString(call.arguments.caption) ?? existing.caption,
        ends_at: parseOptionalDateTime(call.arguments.endsAt) ?? existing.endsAt,
        starts_at: parseOptionalDateTime(call.arguments.startsAt) ?? existing.startsAt,
        state: asEnumValue(
          call.arguments.state,
          ['draft', 'scheduled', 'live', 'archived'] as const,
          existing.state
        ),
        title: asOptionalString(call.arguments.title) ?? existing.title,
      };

      const service = createAdminServiceClient();
      const { error } = await service.from('content_images').update(payload).eq('id', id);

      if (error) {
        return { error: `Unable to update content image: ${error.message}` };
      }

      await writeAdminAuditLog({
        action: 'content_image.update',
        actorEmail: context.adminEmail,
        actorUserId: context.adminId,
        entityId: id,
        entityType: 'content_image',
        metadata: payload,
        summary: `Updated content image ${id}.`,
      });

      revalidatePath('/content/images');
      revalidatePath('/health');
      revalidatePath('/');

      return {
        imageId: id,
        message: `Updated content image ${id}.`,
        payload,
      };
    }

    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}
