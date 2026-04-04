import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperatorChatContext } from './operator-chat';
import { requestOperatorChatCompletion } from './operator-chat';

const context: OperatorChatContext = {
  adminEmail: 'admin@everybible.app',
  adminId: 'admin-1',
  adminName: 'EveryBible Admin',
  dashboardSummary: {
    adminPathCount: 9,
    failedSyncCount: 0,
    liveImageCount: 1,
    liveVerseCount: 2,
    supportUserCount: 3,
    translationCount: 4,
  },
  generatedAt: '2026-04-04T00:00:00.000Z',
  healthIssues: [
    {
      description: 'All clear.',
      href: '/health',
      severity: 'info',
      title: 'No active health issues',
    },
  ],
  recentAdminActions: [],
  recentOperatorActions: [],
};

test('operator chat can call a live admin tool before answering', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push(body);

    if (requests.length === 1) {
      const tools = Array.isArray(body.tools) ? body.tools : [];
      assert.ok(
        tools.some((tool) => {
          if (!tool || typeof tool !== 'object') {
            return false;
          }

          const record = tool as Record<string, unknown>;
          return (
            record.type === 'function' &&
            (record.function as Record<string, unknown> | undefined)?.name === 'inspect_dashboard'
          );
        }),
        'expected inspect_dashboard to be exposed as an OpenAI tool'
      );
      assert.ok(
        tools.some((tool) => {
          if (!tool || typeof tool !== 'object') {
            return false;
          }

          const record = tool as Record<string, unknown>;
          return (
            record.type === 'function' &&
            (record.function as Record<string, unknown> | undefined)?.name === 'run_translation_sync'
          );
        }),
        'expected run_translation_sync to be exposed as an OpenAI tool'
      );
      assert.ok(
        tools.some((tool) => {
          if (!tool || typeof tool !== 'object') {
            return false;
          }

          const record = tool as Record<string, unknown>;
          return (
            record.type === 'function' &&
            (record.function as Record<string, unknown> | undefined)?.name ===
              'list_verse_of_day_entries'
          );
        }),
        'expected list_verse_of_day_entries to be exposed as an OpenAI tool'
      );
      assert.ok(
        tools.some((tool) => {
          if (!tool || typeof tool !== 'object') {
            return false;
          }

          const record = tool as Record<string, unknown>;
          return (
            record.type === 'function' &&
            (record.function as Record<string, unknown> | undefined)?.name ===
              'list_content_images'
          );
        }),
        'expected list_content_images to be exposed as an OpenAI tool'
      );

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      arguments: '{}',
                      name: 'inspect_dashboard',
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        }
      );
    }

    assert.equal(requests.length, 2);
    assert.ok(Array.isArray(body.messages), 'expected the second request to include messages');

    const lastMessage = body.messages?.at(-1) as Record<string, unknown> | undefined;
    assert.equal(lastMessage?.role, 'tool');
    assert.equal(lastMessage?.tool_call_id, 'call_1');
    assert.match(String(lastMessage?.content ?? ''), /active health issues/i);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'The dashboard is healthy.',
              role: 'assistant',
            },
          },
        ],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    );
  }) as typeof fetch;

  try {
    const reply = await requestOperatorChatCompletion({
      apiKey: 'test-key',
      context,
      executeTool: async (toolCall) => {
        assert.equal(toolCall.name, 'inspect_dashboard');
        return {
          dashboardSummary: context.dashboardSummary,
          healthIssues: context.healthIssues,
          recentAdminActions: context.recentAdminActions,
          recentOperatorActions: context.recentOperatorActions,
        };
      },
      messages: [{ content: 'Is the admin healthy?', role: 'user' }],
      systemPrompt: 'System prompt',
    });

    assert.equal(reply, 'The dashboard is healthy.');
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
