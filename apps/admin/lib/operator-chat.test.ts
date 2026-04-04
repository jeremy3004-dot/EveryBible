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
      const toolNames = tools
        .filter((tool) => tool && typeof tool === 'object')
        .map((tool) => {
          const record = tool as Record<string, unknown>;
          return record.type === 'function'
            ? (record.function as Record<string, unknown> | undefined)?.name
            : null;
        })
        .filter((name): name is string => typeof name === 'string');

      const expectedTools = [
        'inspect_dashboard',
        'get_health_issues',
        'get_analytics_overview',
        'search_translations',
        'get_translation',
        'update_translation_metadata',
        'search_users',
        'get_user',
        'list_recent_admin_audit_logs',
        'list_recent_operator_audit_logs',
        'list_sync_runs',
        'run_translation_sync',
        'list_verse_of_day_entries',
        'get_verse_of_day_entry',
        'save_verse_of_day',
        'archive_verse_of_day',
        'list_content_images',
        'get_content_image',
        'update_content_image',
      ];

      for (const toolName of expectedTools) {
        assert.ok(toolNames.includes(toolName), `expected ${toolName} to be exposed as an OpenAI tool`);
      }

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
