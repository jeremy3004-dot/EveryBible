import type { AdminIdentity } from './admin-auth';
import {
  getDashboardSummary,
  getHealthIssues,
  getRecentAuditLogs,
  getRecentOperatorAuditLogs,
  type DashboardSummary,
  type HealthIssue,
  type OperatorAuditLogRow,
} from './admin-data';
import {
  buildOperatorChatTools,
  executeOperatorChatTool,
  type OperatorChatToolCall,
} from './operator-chat-tools';

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
  adminId: string;
  adminName: string;
  dashboardSummary: DashboardSummary;
  generatedAt: string;
  healthIssues: HealthIssue[];
  recentAdminActions: Awaited<ReturnType<typeof getRecentAuditLogs>>;
  recentOperatorActions: OperatorAuditLogRow[];
}

export interface OperatorChatToolExecutor {
  (call: OperatorChatToolCall, context: OperatorChatContext): Promise<unknown>;
}

interface OpenAIChatCompletionToolCall {
  function?: {
    arguments?: string;
    name?: string;
  } | null;
  id?: string;
  type?: string;
}

interface OpenAIChatCompletionMessage {
  content?: unknown;
  tool_calls?: OpenAIChatCompletionToolCall[];
}

interface OpenAIChatCompletionChoice {
  message?: OpenAIChatCompletionMessage | null;
}

interface OpenAIChatCompletionPayload {
  choices?: OpenAIChatCompletionChoice[];
}

interface OpenAIChatCompletionRequestMessage {
  content: string | null;
  role: 'assistant' | 'system' | 'tool' | 'user';
  tool_call_id?: string;
  tool_calls?: Array<{
    function: {
      arguments: string;
      name: string;
    };
    id: string;
    type: 'function';
  }>;
}

const DEFAULT_OPERATOR_CHAT_MODEL = 'gpt-5.4-mini';
const MAX_CHAT_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOOL_ROUNDS = 4;

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
    .map(
      (action) => `- ${action.created_at} | ${action.action} | ${action.entity_type} | ${action.summary}`
    )
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

function formatHealthIssues(issues: HealthIssue[]): string {
  if (issues.length === 0) {
    return '- No active health issues were reported.';
  }

  return issues
    .map((issue) => `- ${issue.severity} | ${issue.title} | ${issue.description}`)
    .join('\n');
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
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
}

function parseToolArguments(rawArguments: string | undefined): Record<string, unknown> {
  if (!rawArguments || rawArguments.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawArguments);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed tool arguments and let the executor surface a readable error.
  }

  return {};
}

function normalizeToolCall(
  call: OpenAIChatCompletionToolCall,
  index: number
): OperatorChatToolCall | null {
  if (!call || call.type !== 'function' || !call.function?.name) {
    return null;
  }

  return {
    arguments: parseToolArguments(call.function.arguments),
    id: call.id ?? `tool_call_${index}`,
    name: call.function.name,
  };
}

function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
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
    'Use the live tools whenever the user asks about current state or a live action.',
    'Speak directly to the operator. Be concise, specific, and honest about uncertainty.',
    'If a detail is not present in the prompt or a tool result, say so instead of inventing it.',
    'If the user asks for a live mutation, use the approved tool only when the request is explicit.',
    'Prefer short bullets and concrete next steps when useful.',
    'Live tools available: inspect_dashboard, get_health_issues, get_analytics_overview, search_translations, get_translation, update_translation_metadata, search_users, get_user, list_recent_admin_audit_logs, list_recent_operator_audit_logs, list_sync_runs, run_translation_sync, list_verse_of_day_entries, get_verse_of_day_entry, save_verse_of_day, archive_verse_of_day, list_content_images, get_content_image, update_content_image.',
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
    'Known health issues:',
    formatHealthIssues(context.healthIssues),
    '',
    'Recent OpenClaw actions:',
    formatOperatorActions(context.recentOperatorActions),
    '',
    'Recent admin actions:',
    formatAdminActions(context.recentAdminActions),
  ].join('\n');
}

export async function buildOperatorChatContext(identity: AdminIdentity): Promise<OperatorChatContext> {
  const [dashboardSummary, healthIssues, recentAdminActions, recentOperatorActions] = await Promise.all([
    getDashboardSummary(),
    getHealthIssues(),
    getRecentAuditLogs(5),
    getRecentOperatorAuditLogs(5),
  ]);

  return {
    adminEmail: identity.email,
    adminId: identity.id,
    adminName: identity.name,
    dashboardSummary,
    generatedAt: new Date().toISOString(),
    healthIssues,
    recentAdminActions,
    recentOperatorActions,
  };
}

export async function requestOperatorChatCompletion(params: {
  apiKey: string;
  context: OperatorChatContext;
  executeTool?: OperatorChatToolExecutor;
  messages: OperatorChatMessage[];
  model?: string;
  systemPrompt: string;
}): Promise<string> {
  const executeTool = params.executeTool ?? executeOperatorChatTool;
  const conversation: OpenAIChatCompletionRequestMessage[] = [
    {
      content: params.systemPrompt,
      role: 'system',
    },
    ...params.messages.map((message) => ({
      content: message.content,
      role: message.role,
    })),
  ];
  const tools = buildOperatorChatTools();

  for (let toolRound = 0; toolRound < MAX_TOOL_ROUNDS; toolRound += 1) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: conversation,
        model: params.model ?? getOperatorChatModel(),
        parallel_tool_calls: true,
        tool_choice: 'auto',
        tools,
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

    const payload = (await response.json()) as OpenAIChatCompletionPayload;
    const assistantMessage = payload.choices?.[0]?.message ?? null;

    if (!assistantMessage) {
      throw new Error('OpenAI returned an empty assistant response.');
    }

    const toolCalls = (assistantMessage.tool_calls ?? [])
      .map((call, index) => normalizeToolCall(call, index))
      .filter((call): call is OperatorChatToolCall => Boolean(call));
    const assistantText = extractMessageText(assistantMessage.content);

    if (toolCalls.length === 0) {
      if (assistantText.length > 0) {
        return assistantText;
      }

      throw new Error('OpenAI returned an empty assistant response.');
    }

    conversation.push({
      content: assistantText.length > 0 ? assistantText : null,
      role: 'assistant',
      tool_calls: toolCalls.map((call) => ({
        function: {
          arguments: JSON.stringify(call.arguments),
          name: call.name,
        },
        id: call.id,
        type: 'function',
      })),
    });

    for (const toolCall of toolCalls) {
      const toolResult = await executeTool(toolCall, params.context);
      conversation.push({
        content: serializeToolResult(toolResult),
        role: 'tool',
        tool_call_id: toolCall.id,
      });
    }
  }

  throw new Error('Operator chat exceeded the maximum tool rounds.');
}
