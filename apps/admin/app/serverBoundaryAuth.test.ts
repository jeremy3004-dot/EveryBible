/**
 * Every server action and route handler in the admin app must check
 * profiles.admin_role itself. The dashboard layout's check is not enough: a
 * server action is a public POST endpoint and a route handler is reachable
 * without rendering any layout.
 *
 * This test discovers every `actions.ts` and `route.ts` under app/, runs each
 * exported handler through the REAL admin-auth module, and proves that a
 * signed-out visitor and a signed-in non-admin reach nothing past the
 * admin_role lookup. A new handler is covered automatically; one that forgets
 * the check fails here.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test, { mock } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  ADMIN_ROOT,
  RedirectSignal,
  createSupabaseFake,
  formData,
  makeFakeUser,
  mockModule,
  mockNextServerRuntime,
} from '../lib/testing/adminTestHarness';

// Handlers that are intentionally reachable without an admin session. Each has
// its own gate and its own tests.
const PUBLIC_HANDLERS: Record<string, string> = {
  'app/(auth)/login/actions.ts': 'Sign-in and sign-out must work before an admin session exists.',
  'app/api/cron/upstream-sync/route.ts':
    'Vercel Cron bearer secret (app/api/cron/upstream-sync/route.test.ts).',
};

const sessionClient = createSupabaseFake();
const serviceClient = createSupabaseFake();
const sideEffects: string[] = [];

mockModule(mock, '@/lib/supabase/server', {
  createAdminServerClient: async () => sessionClient.client,
});
mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => serviceClient.client,
});
mockNextServerRuntime(mock);
mockModule(mock, '@/lib/upstream-sync', {
  runUpstreamTranslationSync: async (actor: string | null) => {
    sideEffects.push(`upstream-sync:${actor}`);
    return { runId: 'run-1', insertedCount: 0, updatedCount: 0 };
  },
});
mockModule(mock, '@/lib/language-atlas/server', {
  getAtlasIndex: async () => {
    sideEffects.push('atlas:index');
    return { schemaVersion: 1, records: [] };
  },
  getAtlasIndexGzip: async () => {
    sideEffects.push('atlas:index-gzip');
    return Buffer.from([]);
  },
  getAtlasDetail: async (id: string) => {
    sideEffects.push(`atlas:detail:${id}`);
    return { id };
  },
});
mockModule(mock, '@/lib/operator-chat', {
  buildOperatorSystemPrompt: () => 'system prompt',
  getOperatorChatApiKey: () => 'configured-key',
  getOperatorChatModel: () => 'model',
  runOperatorChat: async () => {
    sideEffects.push('operator-chat');
    return 'reply';
  },
  sanitizeOperatorChatMessages: (messages: unknown) => (Array.isArray(messages) ? messages : []),
});

type Persona = 'signed_out' | 'ordinary_user' | 'super_admin';

function become(persona: Persona) {
  sessionClient.reset();
  serviceClient.reset();
  sideEffects.length = 0;
  sessionClient.auth.setUser(
    persona === 'signed_out' ? null : makeFakeUser({ id: 'user-7', email: 'person@church.org' })
  );
  serviceClient.respondTo('profiles', () => ({
    data:
      persona === 'signed_out'
        ? null
        : {
            id: 'user-7',
            email: 'person@church.org',
            display_name: 'Person',
            admin_role: persona === 'super_admin' ? 'super_admin' : null,
          },
  }));
}

function discoverHandlerFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...discoverHandlerFiles(entryPath));
    } else if (entry.name === 'actions.ts' || entry.name === 'route.ts') {
      found.push(path.relative(ADMIN_ROOT, entryPath).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

type Handler = (...args: unknown[]) => Promise<unknown>;

async function loadHandlers(file: string): Promise<Array<[string, Handler]>> {
  const loaded = (await import(pathToFileURL(path.join(ADMIN_ROOT, file)).href)) as Record<
    string,
    unknown
  >;
  return Object.entries(loaded).filter((entry): entry is [string, Handler] => {
    return typeof entry[1] === 'function';
  });
}

function invoke(file: string, name: string, handler: Handler): Promise<unknown> {
  if (file.endsWith('route.ts')) {
    const request = new Request('https://admin.example/api/probe', {
      method: name,
      ...(name === 'GET' || name === 'HEAD'
        ? {}
        : {
            body: JSON.stringify({ messages: [{ role: 'user', content: 'status?' }] }),
            headers: { 'content-type': 'application/json' },
          }),
    });
    return handler(request, { params: Promise.resolve({ id: 'iso:eng' }) });
  }
  return handler(
    formData({
      adminNotes: 'note',
      distributionState: 'published',
      feedbackId: 'feedback-1',
      isAvailable: 'on',
      note: 'Corrected the verse numbering.',
      returnTo: '/feedback',
      translationId: 'bsb',
    })
  );
}

async function outcome(promise: Promise<unknown>) {
  try {
    const value = await promise;
    return value instanceof Response ? { status: value.status } : { value };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    return { error };
  }
}

function backendAccessBeyondAuth() {
  return [
    ...serviceClient.calls
      .filter((call) => call.table !== 'profiles')
      .map((call) => `service:${call.table}:${call.operation}`),
    ...serviceClient.functionCalls.map((call) => `function:${call.name}`),
    ...serviceClient.storageCalls.map((call) => `storage:${call.bucket}`),
    ...sideEffects,
  ];
}

const handlerFiles = discoverHandlerFiles(path.join(ADMIN_ROOT, 'app'));
const protectedFiles = handlerFiles.filter((file) => !(file in PUBLIC_HANDLERS));

test('discovery finds the admin handlers and every public exemption still exists', () => {
  for (const file of Object.keys(PUBLIC_HANDLERS)) {
    assert.ok(handlerFiles.includes(file), `stale public exemption: ${file}`);
  }
  // Sanity floor so a broken walk cannot pass vacuously.
  assert.ok(protectedFiles.length >= 6, `only found ${protectedFiles.join(', ')}`);
});

for (const file of protectedFiles) {
  for (const persona of ['signed_out', 'ordinary_user'] as const) {
    test(`${file}: every export rejects a ${persona} before any backend access`, async () => {
      const handlers = await loadHandlers(file);
      assert.ok(handlers.length > 0, `${file} exports no handlers`);
      for (const [name, handler] of handlers) {
        become(persona);
        const result = await outcome(invoke(file, name, handler));
        if (file.endsWith('route.ts')) {
          assert.deepEqual(result, { status: 401 }, `${name} must answer 401`);
        } else {
          assert.deepEqual(
            result,
            {
              redirect: persona === 'signed_out' ? '/login?reason=auth' : '/login?reason=forbidden',
            },
            `${name} must redirect to login`
          );
        }
        assert.deepEqual(backendAccessBeyondAuth(), [], `${name} touched the backend`);
      }
    });
  }

  // Control: the same probe gets past the gate for an admin, so the rejections
  // above come from the admin_role check rather than from a malformed probe.
  test(`${file}: every export admits a super_admin (control)`, async () => {
    for (const [name, handler] of await loadHandlers(file)) {
      become('super_admin');
      const result = await outcome(invoke(file, name, handler));
      assert.ok(!('error' in result), `${name} threw for an admin: ${String(result.error)}`);
      assert.notDeepEqual(result, { status: 401 }, `${name} rejected an admin`);
      assert.ok(
        !('redirect' in result) || !String(result.redirect).startsWith('/login'),
        `${name} redirected an admin to login`
      );
    }
  });
}
