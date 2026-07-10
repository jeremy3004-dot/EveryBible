import type { AdminIdentity } from './admin-auth';
import { OPERATOR_TOOL_DECLARATIONS, OPERATOR_TOOL_EXECUTORS } from './operator-tools';

// Gemini-backed admin operator (Phase 5). Replaces the earlier OpenAI helper that
// could only see 7 canned integers: this one is grounded in LIVE data through
// read-only tool calls (see operator-tools.ts). Strictly read-only.

export interface OperatorChatMessage {
  content: string;
  role: 'assistant' | 'user';
}

const DEFAULT_OPERATOR_CHAT_MODEL = 'gemini-2.5-flash';
const MAX_CHAT_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOOL_ROUNDS = 6;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function trimText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n/g, '\n').trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function getOperatorChatModel(): string {
  return process.env.EVERYBIBLE_ADMIN_CHAT_MODEL?.trim() || DEFAULT_OPERATOR_CHAT_MODEL;
}

export function getOperatorChatApiKey(): string | null {
  const value = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)?.trim();
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
      return [{ content, role: record.role as OperatorChatMessage['role'] }];
    })
    .slice(-MAX_CHAT_MESSAGES);
}

export function buildOperatorSystemPrompt(identity: AdminIdentity, generatedAt: string): string {
  return [
    'You are the EveryBible Admin AI helper inside the internal admin shell.',
    'Speak directly to the operator. Be concise, specific, and honest about uncertainty.',
    'You have READ-ONLY tools that return live admin data — call them to ground every',
    'factual answer instead of guessing. Never claim you changed data or code; you cannot.',
    'If the operator asks for a mutation or code change, explain the safe path: the approved',
    'admin UI workflows for data, and the reviewable git workflow for source.',
    'Prefer short bullets and concrete next steps. If a tool returns nothing, say so plainly.',
    '',
    `Operator: ${identity.name} <${identity.email}>`,
    `Session started: ${generatedAt}`,
  ].join('\n');
}

// ── Gemini REST types (minimal) ─────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  contents: GeminiContent[]
): Promise<GeminiContent> {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ function_declarations: OPERATOR_TOOL_DECLARATIONS }],
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  // The Gemini endpoint occasionally returns a transient empty 404/5xx; retry a
  // few times with backoff before surfacing an error to the operator.
  let lastError = 'Gemini request failed.';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error calling Gemini.';
      await delay(400 * (attempt + 1));
      continue;
    }

    const raw = await response.text();
    if (!response.ok || raw.trim().length === 0) {
      lastError = raw.trim().length > 0 ? extractGeminiError(raw) : `Gemini returned HTTP ${response.status}.`;
      await delay(400 * (attempt + 1));
      continue;
    }

    const payload = JSON.parse(raw) as {
      candidates?: Array<{ content?: GeminiContent }>;
    };
    const content = payload.candidates?.[0]?.content;
    if (content?.parts) {
      return content;
    }
    lastError = 'Gemini returned no content.';
    await delay(400 * (attempt + 1));
  }

  throw new Error(lastError);
}

function extractGeminiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? 'Gemini request failed.';
  } catch {
    return 'Gemini request failed.';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runOperatorChat(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: OperatorChatMessage[];
}): Promise<string> {
  const contents: GeminiContent[] = params.messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const modelContent = await callGemini(params.apiKey, params.model, params.systemPrompt, contents);
    const functionCalls = modelContent.parts.filter((part) => part.functionCall);

    if (functionCalls.length === 0) {
      const text = modelContent.parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (text.length > 0) {
        return text;
      }
      return 'I could not produce a response for that. Try rephrasing your question.';
    }

    // Record the model's tool-call turn, then execute each tool and feed the
    // results back for the next round.
    contents.push(modelContent);
    const responseParts: GeminiPart[] = [];
    for (const part of functionCalls) {
      const call = part.functionCall!;
      const executor = OPERATOR_TOOL_EXECUTORS[call.name];
      let result: unknown;
      try {
        result = executor
          ? await executor(call.args ?? {})
          : { error: `Unknown tool "${call.name}".` };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : 'Tool execution failed.' };
      }
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return 'I gathered several data points but could not finish the answer within the tool-call budget. Please narrow the question.';
}
