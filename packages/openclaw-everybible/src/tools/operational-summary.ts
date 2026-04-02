import { Type } from '@sinclair/typebox';
import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk/plugin-entry';

import {
  getContentHealthSummary,
  getRecentAdminActions,
  getTranslationSummary,
  type ContentHealthSummary,
  type RecentAdminAction,
  type TranslationSummary,
} from '../supabase';

const schemaOptions = { additionalProperties: false } as const;

export function buildContentHealthText(summary: ContentHealthSummary): string {
  return [
    `Failed syncs: ${summary.failedSyncCount}`,
    `Live verse entries: ${summary.liveVerseCount}`,
    `Live content images: ${summary.liveImageCount}`,
    `Live homepage override: ${summary.liveHomepageOverride ? 'yes' : 'no'}`,
  ].join('\n');
}

export function buildTranslationSummaryText(summary: TranslationSummary): string {
  const distribution = Object.entries(summary.distributionCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `${state}: ${count}`)
    .join(', ');

  const recent = summary.recentTranslations
    .slice(0, 5)
    .map((translation) => `${translation.languageName} - ${translation.name} (${translation.distributionState})`)
    .join('\n');

  return [
    `Tracked translations: ${summary.totalTranslations}`,
    distribution ? `Distribution counts: ${distribution}` : 'Distribution counts: none found',
    recent ? `Recent translations:\n${recent}` : 'Recent translations: none found',
  ].join('\n');
}

export function buildRecentAdminActionsText(actions: RecentAdminAction[]): string {
  if (actions.length === 0) {
    return 'No recent admin actions were found.';
  }

  return actions
    .map((action) => {
      return `${action.createdAt} - ${action.action} on ${action.entityType}: ${action.summary}`;
    })
    .join('\n');
}

export function createGetContentHealthSummaryTool(_context: OpenClawPluginToolContext) {
  return {
    name: 'get_content_health_summary',
    label: 'Get Content Health Summary',
    description:
      'Read a lightweight health summary for EveryBible content operations, including failed syncs and live content counts.',
    ownerOnly: true,
    parameters: Type.Object({}, schemaOptions),
    async execute() {
      const summary = await getContentHealthSummary();

      return {
        content: [
          {
            type: 'text' as const,
            text: buildContentHealthText(summary),
          },
        ],
        details: {
          status: 'ok',
          summary,
        },
      };
    },
  };
}

export function createGetTranslationSummaryTool(_context: OpenClawPluginToolContext) {
  return {
    name: 'get_translation_summary',
    label: 'Get Translation Summary',
    description:
      'Read a summary of EveryBible translation catalog state without mutating anything.',
    ownerOnly: true,
    parameters: Type.Object({}, schemaOptions),
    async execute() {
      const summary = await getTranslationSummary();

      return {
        content: [
          {
            type: 'text' as const,
            text: buildTranslationSummaryText(summary),
          },
        ],
        details: {
          status: 'ok',
          summary,
        },
      };
    },
  };
}

export function createListRecentAdminActionsTool(_context: OpenClawPluginToolContext) {
  return {
    name: 'list_recent_admin_actions',
    label: 'List Recent Admin Actions',
    description:
      'List recent admin and operator audit actions for grounding and debugging. This is read-only.',
    ownerOnly: true,
    parameters: Type.Object(
      {
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 25 })),
      },
      schemaOptions
    ),
    async execute(_toolCallId: string, params: { limit?: number }) {
      const actions = await getRecentAdminActions(params.limit ?? 10);

      return {
        content: [
          {
            type: 'text' as const,
            text: buildRecentAdminActionsText(actions),
          },
        ],
        details: {
          status: 'ok',
          actions,
        },
      };
    },
  };
}
