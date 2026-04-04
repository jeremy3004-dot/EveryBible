import type { AdminIdentity } from './admin-auth';
import {
  getDashboardSummary,
  getRecentAuditLogs,
  getRecentOperatorAuditLogs,
  type DashboardSummary,
  type OperatorAuditLogRow,
} from './admin-data';

export interface OperatorChatMessage {
  content: string;
  role: 'assistant' | 'user';
}

export interface OperatorChatAvailability {
  available: boolean;
  model: string;
  reason?: string | null;
}

export interface OperatorChatContext {
  adminEmail: string;
  adminName: string;
  dashboardSummary: DashboardSummary;
  generatedAt: string;
  recentAdminActions: Awaited<ReturnType<typeof getRecentAuditLogs>>;
  recentOperatorActions: OperatorAuditLogRow[];
}

const DEFAULT_OPERATOR_CHAT_MODEL = 'gpt-5.4-mini';
const MAX_CHAT_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4000;

function trimText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\r\n/g, '\n').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function formatAdminActions(actions: Awaited<ReturnType<typeof getRecentAuditLogs>>): string {
  if (actions.length === 0) {
    return '- No recent admin actions were recorded.';
  }

  return actions
    .map((action) => `- ${action.created_at} | ${action.action} | ${action.entity_type} | ${action.summary}`)
    .join('\n');
}

function formatOperatorActions(actions: OperatorAuditLogRow[]): string {
  if (actions.length === 0) {
    return '- No OpenClaw mutations have been recorded yet.';
  }

  return actions
    .map((action) => {
      const channel = action.metadata?.channel ?? 'unknown';
      const toolName = action.metadata?.toolName ?? action.action;
      return `- ${action.created_at} | ${toolName} | ${channel} | ${action.summary}`;
    })
    .join('\n');
}

export function getOperatorChatModel(): string {
  return process.env.EVERYBIBLE_ADMIN_CHAT_MODEL?.trim() || DEFAULT_OPERATOR_CHAT_MODEL;
}

export function getOperatorChatApiKey(): string | null {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

export function sanitizeOperatorChatMessages(messages: unknown): OperatorChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .flatMap((message) => {
      if (!message || typeof message !== 'object') {
        return [];
      }

      const record = message as Record<string, unknown>;
      if (record.role !== 'assistant' && record.role !== 'user') {
        return [];
      }

      const content = trimText(record.content);
      if (!content) {
        return [];
      }

      return [
        {
          content,
          role: record.role as OperatorChatMessage['role'],
        } satisfies OperatorChatMessage,
      ];
    })
    .slice(-MAX_CHAT_MESSAGES);
}

export function buildOperatorChatSystemPrompt(context: OperatorChatContext): string {
  return [
    'You are the EveryBible Admin AI helper inside the internal admin shell.',
    'Speak directly to the operator. Be concise, specific, and honest about uncertainty.',
    'Use the admin snapshot below as grounding. If a detail is not present, say so instead of inventing it.',
    'Do not claim you changed data or code unless the conversation context explicitly shows that you did.',
    'If the user asks for a live mutation or source-code change, explain the safe path: Telegram/OpenClaw for approved content and data changes, or the reviewable git workflow for source code.',
    'Prefer short bullets and concrete next steps when useful.',
    '',
    `Operator identity: ${context.adminName} <${context.adminEmail}>`,
    `Snapshot generated at: ${context.generatedAt}`,
    '',
    'Current admin snapshot:',
    `- Dashboard paths: ${context.dashboardSummary.adminPathCount}`,
    `- Failed sync runs: ${context.dashboardSummary.failedSyncCount}`,
    `- Live verse entries: ${context.dashboardSummary.liveVerseCount}`,
    `- Live content images: ${context.dashboardSummary.liveImageCount}`,
    `- Support users: ${context.dashboardSummary.supportUserCount}`,
    `- Translation catalog rows: ${context.dashboardSummary.translationCount}`,
    '',
    'Recent OpenClaw actions:',
    formatOperatorActions(context.recentOperatorActions),
    '',
    'Recent admin actions:',
    formatAdminActions(context.recentAdminActions),
  ].join('\n');
}

export async function buildOperatorChatContext(identity: AdminIdentity): Promise<OperatorChatContext> {
  const [dashboardSummary, recentAdminActions, recentOperatorActions] = await Promise.all([
    getDashboardSummary(),
    getRecentAuditLogs(5),
    getRecentOperatorAuditLogs(5),
  ]);

  return {
    adminEmail: identity.email,
    adminName: identity.name,
    dashboardSummary,
    generatedAt: new Date().toISOString(),
    recentAdminActions,
    recentOperatorActions,
  };
}

export async function requestOperatorChatCompletion(params: {
  apiKey: string;
  messages: OperatorChatMessage[];
  model?: string;
  systemPrompt: string;
}): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          content: params.systemPrompt,
          role: 'system',
        },
        ...params.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
      ],
      model: params.model ?? getOperatorChatModel(),
    }),
  });

  if (!response.ok) {
    const fallbackError = `OpenAI chat request failed with status ${response.status}`;
    const errorPayload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } | string }
      | null;
    const errorMessage =
      typeof errorPayload?.error === 'string'
        ? errorPayload.error
        : errorPayload?.error?.message ?? fallbackError;

    throw new Error(errorMessage);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      } | null;
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part) {
          const textValue = (part as { text?: unknown }).text;
          return typeof textValue === 'string' ? textValue : '';
        }

        return '';
      })
      .join('')
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  throw new Error('OpenAI returned an empty assistant response.');
}
