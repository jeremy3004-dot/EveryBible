// Loads a Deno edge function under Node for behavioral tests, through the real module loader
// (tsx), so the function's own files are what run and what coverage sees. Node cannot fetch
// `https://esm.sh/...` or provide `Deno`, so this module:
// - maps `https://esm.sh/@supabase/supabase-js@*` to ./supabaseJsStub.ts with a resolve hook,
// - installs a `Deno` global whose `env.get` and `serve` are scoped to the harness in use,
// - routes `fetch` and `console.*` inside a request to that harness (logs are captured, the
//   network is disabled unless a test supplies `fetch`).
// Each entry file is loaded once per test process; every harness reuses its `Deno.serve`
// handler and supplies its own client, env and fetch through an AsyncLocalStorage scope.
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { edgeRequestScope, type EdgeRequestScope } from './supabaseJsStub';

export interface EdgeQueryCall {
  /** Table name, or `rpc:<fn>` for Postgres function calls. */
  table: string;
  steps: Array<{ method: string; args: unknown[] }>;
}

export interface EdgeQueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface EdgeHarnessOptions {
  env?: Record<string, string | undefined>;
  /** Answer for every awaited query chain. Defaults to `{ data: null, error: null }`. */
  respond?: (call: EdgeQueryCall) => EdgeQueryResult;
  /** Result of `auth.getUser(token)`. Defaults to no user. */
  getUser?: (token: string) => { data: { user: { id: string } | null }; error: unknown };
  /** Overrides for `storage.from(bucket).<method>(...)`. */
  storage?: Record<string, (...args: unknown[]) => unknown>;
  /** Replaces the recording client entirely (for stateful fakes); `calls` then stays empty. */
  client?: unknown;
  /**
   * Builds the client per `createClient(url, key, options)` call, for functions that create
   * several clients with different credentials. Takes precedence over `client`.
   */
  createClient?: (url: string, key: string, options?: EdgeClientOptions) => unknown;
  fetch?: typeof fetch;
}

export interface EdgeClientOptions {
  global?: { headers?: Record<string, string> };
  auth?: Record<string, unknown>;
}

export interface EdgeClientCreation {
  url: string;
  key: string;
  options?: EdgeClientOptions;
}

export interface EdgeHarness {
  handle: (request: Request) => Promise<Response>;
  calls: EdgeQueryCall[];
  /** Every `createClient` call, in order, with the credentials it was given. */
  clientsCreated: EdgeClientCreation[];
  /** Everything the function wrote with console.error, stringified. */
  loggedErrors: string[];
}

type Handler = (request: Request) => Promise<Response>;

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_JS_STUB = pathToFileURL(path.join(HARNESS_DIR, 'supabaseJsStub.ts')).href;
const SUPABASE_JS_URL = /^https:\/\/esm\.sh\/@supabase\/supabase-js(?:@[^/]+)?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (SUPABASE_JS_URL.test(specifier)) {
      return nextResolve(SUPABASE_JS_STUB, context);
    }
    return nextResolve(specifier, context);
  },
});

const describe = (value: unknown): string => {
  if (typeof value === 'string') return value;
  // Database errors are plain `{ code, message }` objects, so match on shape, not Error.
  if (value && typeof value === 'object' && typeof (value as Error).message === 'string') {
    return (value as Error).message;
  }
  return JSON.stringify(value) ?? String(value);
};

const scope = (): EdgeRequestScope | undefined => edgeRequestScope.getStore();

let servedHandler: Handler | undefined;
(globalThis as { Deno?: unknown }).Deno = {
  env: { get: (name: string) => scope()?.env[name] },
  serve: (handler: Handler) => {
    servedHandler = handler;
  },
};

const realFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
  const active = scope();
  return active ? active.fetch(...args) : realFetch(...args);
}) as typeof fetch;

for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    const active = scope();
    if (!active) {
      original(...args);
      return;
    }
    if (level === 'error') active.loggedErrors.push(args.map(describe).join(' '));
  };
}

const handlers = new Map<string, Handler>();
const requireEntry = createRequire(import.meta.url);

function entryHandler(entryFile: string): Handler {
  const cached = handlers.get(entryFile);
  if (cached) return cached;
  servedHandler = undefined;
  requireEntry(entryFile);
  if (!servedHandler) {
    throw new Error(`${entryFile} did not call Deno.serve`);
  }
  handlers.set(entryFile, servedHandler);
  return servedHandler;
}

// claim_passcode_attempt() (migration 20260924113017) answers null for "locked out", and
// consume_feedback_submission_budget() (20260924113023) must answer a row, so an unscripted
// `{}` would read as a lockout or an outage. Until a test scripts one of these RPCs with an
// explicit `data` or `error`, it answers as PostgREST does while the function is not
// deployed, and the callers take their previous paths, which those tests script.
const FUNCTION_NOT_DEPLOYED: EdgeQueryResult = {
  error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
};
const UNSCRIPTED_DEFAULTS: Record<string, EdgeQueryResult> = {
  'rpc:claim_passcode_attempt': FUNCTION_NOT_DEPLOYED,
  'rpc:consume_feedback_submission_budget': FUNCTION_NOT_DEPLOYED,
};

function recordingClient(calls: EdgeQueryCall[], options: EdgeHarnessOptions): unknown {
  const scripted = options.respond ?? (() => ({ data: null, error: null }));
  const respond = (call: EdgeQueryCall): EdgeQueryResult => {
    const result = scripted(call);
    const fallback = UNSCRIPTED_DEFAULTS[call.table];
    return fallback && !('data' in result) && !('error' in result) ? fallback : result;
  };
  const chain = (call: EdgeQueryCall): unknown => {
    calls.push(call);
    const proxy: unknown = new Proxy(() => undefined, {
      get(_target, property) {
        if (property === 'then') {
          const result = Promise.resolve().then(() => ({
            data: null,
            error: null,
            count: null,
            ...respond(call),
          }));
          return result.then.bind(result);
        }
        return (...args: unknown[]) => {
          call.steps.push({ method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };

  return {
    from: (table: string) => chain({ table, steps: [] }),
    rpc: (fn: string, args?: unknown) =>
      chain({ table: `rpc:${fn}`, steps: [{ method: 'rpc', args: [args] }] }),
    auth: {
      getUser: async (token: string) =>
        options.getUser?.(token) ?? { data: { user: null }, error: null },
    },
    storage: {
      from: (bucket: string) =>
        new Proxy(
          {},
          {
            get:
              (_target, method) =>
              async (...args: unknown[]) =>
                options.storage?.[`${bucket}:${String(method)}`]?.(...args) ?? {
                  data: null,
                  error: null,
                },
          }
        ),
    },
  };
}

export function loadEdgeFunction(entryFile: string, options: EdgeHarnessOptions = {}): EdgeHarness {
  const calls: EdgeQueryCall[] = [];
  const clientsCreated: EdgeClientCreation[] = [];
  const loggedErrors: string[] = [];
  const client = options.client ?? recordingClient(calls, options);
  const requestScope: EdgeRequestScope = {
    createClient: (...args) => {
      const [url, key, clientOptions] = args as [string, string, EdgeClientOptions | undefined];
      clientsCreated.push({ url, key, ...(clientOptions ? { options: clientOptions } : {}) });
      return options.createClient ? options.createClient(url, key, clientOptions) : client;
    },
    env: {
      SUPABASE_URL: 'https://project.example',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      ...options.env,
    },
    loggedErrors,
    fetch:
      options.fetch ??
      (async () => {
        throw new Error('network disabled in tests');
      }),
  };
  const handler = entryHandler(path.resolve(entryFile));

  return {
    handle: (request) => edgeRequestScope.run(requestScope, () => handler(request)),
    calls,
    clientsCreated,
    loggedErrors,
  };
}
