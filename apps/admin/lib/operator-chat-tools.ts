import type { OperatorChatContext } from './operator-chat';

import {
  getDashboardSummary,
  getHealthIssues,
  getRecentAuditLogs,
  getRecentOperatorAuditLogs,
  listContentImages,
  getSupportUserDetail,
  getTranslationDetail,
  listSyncRuns,
  listSupportUsers,
  listTranslations,
  listVerseOfDayEntries,
} from './admin-data';
import { writeAdminAuditLog } from './audit-log';
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
  ];
}

export async function executeOperatorChatTool(
  call: OperatorChatToolCall,
  context: OperatorChatContext
): Promise<unknown> {
  switch (call.name) {
    case 'inspect_dashboard': {
      const [dashboardSummary, healthIssues, recentAdminActions, recentOperatorActions, recentSyncRuns] =
        await Promise.all([
          getDashboardSummary(),
          getHealthIssues(),
          getRecentAuditLogs(8),
          getRecentOperatorAuditLogs(8),
          listSyncRuns(5),
        ]);

      return {
        dashboardSummary,
        generatedAt: new Date().toISOString(),
        healthIssues,
        recentAdminActions,
        recentOperatorActions,
        recentSyncRuns,
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

    case 'list_content_images': {
      const limit = asPositiveInteger(call.arguments.limit, 12, MAX_SEARCH_RESULTS);
      const entries = await listContentImages();

      return {
        limit,
        results: summarizeContentImages(entries).slice(0, limit),
      };
    }

    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}
