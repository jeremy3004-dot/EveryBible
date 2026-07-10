import { NextResponse } from 'next/server';

import { getAdminIdentity } from '@/lib/admin-auth';
import {
  buildOperatorSystemPrompt,
  getOperatorChatApiKey,
  getOperatorChatModel,
  runOperatorChat,
  sanitizeOperatorChatMessages,
} from '@/lib/operator-chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
    ...init,
  });
}

export async function GET() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = getOperatorChatApiKey();
  const model = getOperatorChatModel();

  return json({
    available: Boolean(apiKey),
    model,
    reason: apiKey ? null : 'missing_gemini_api_key',
  });
}

export async function POST(request: Request) {
  const identity = await getAdminIdentity();
  if (!identity) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = getOperatorChatApiKey();
  if (!apiKey) {
    return json(
      {
        error:
          'The admin AI helper is not configured yet. Set GEMINI_API_KEY in Vercel to enable chat.',
        reason: 'missing_gemini_api_key',
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const messages = sanitizeOperatorChatMessages(body?.messages);

  if (messages.length === 0) {
    return json({ error: 'Send a message first.' }, { status: 400 });
  }

  try {
    const generatedAt = new Date().toISOString();
    const model = getOperatorChatModel();
    const reply = await runOperatorChat({
      apiKey,
      model,
      systemPrompt: buildOperatorSystemPrompt(identity, generatedAt),
      messages,
    });

    return json({ generatedAt, model, reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown operator chat error';
    return json({ error: message }, { status: 500 });
  }
}
