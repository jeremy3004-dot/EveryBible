// Loads a Deno edge function under Node for behavioral tests. Edge functions import
// `https://esm.sh/...` and call `Deno.serve`, neither of which Node can load, so the entry
// file (and any `../_shared/*.ts` it imports) is transpiled to CommonJS and run in a vm
// context with a scripted Supabase client. Same approach as aggregate-engagement/index.test.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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
  fetch?: typeof fetch;
}

export interface EdgeHarness {
  handle: (request: Request) => Promise<Response>;
  calls: EdgeQueryCall[];
  /** Everything the function wrote with console.error, stringified. */
  loggedErrors: string[];
}

const transpile = (file: string): string =>
  ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

// Errors created inside the vm context fail `instanceof Error` here, so match on shape.
const describe = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as Error).message === 'string') {
    return (value as Error).message;
  }
  return JSON.stringify(value) ?? String(value);
};

export function loadEdgeFunction(entryFile: string, options: EdgeHarnessOptions = {}): EdgeHarness {
  const calls: EdgeQueryCall[] = [];
  const loggedErrors: string[] = [];
  const respond = options.respond ?? (() => ({ data: null, error: null }));
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://project.example',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...options.env,
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

  const client = {
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

  let handle: ((request: Request) => Promise<Response>) | undefined;
  const moduleCache = new Map<string, unknown>();

  const load = (file: string): unknown => {
    const cached = moduleCache.get(file);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    moduleCache.set(file, exports);
    runInNewContext(transpile(file), {
      exports,
      require: (specifier: string) => {
        if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) {
          return { createClient: () => client };
        }
        if (specifier.startsWith('.')) {
          return load(path.resolve(path.dirname(file), specifier));
        }
        throw new Error(`Unexpected import in edge function: ${specifier}`);
      },
      Deno: {
        env: { get: (name: string) => env[name] },
        serve: (handler: (request: Request) => Promise<Response>) => {
          handle = handler;
        },
      },
      console: {
        log: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: (...args: unknown[]) => {
          loggedErrors.push(args.map(describe).join(' '));
        },
      },
      Request,
      Response,
      Headers,
      URL,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      crypto,
      atob,
      btoa,
      fetch:
        options.fetch ??
        (async () => {
          throw new Error('network disabled in tests');
        }),
    });
    return exports;
  };

  load(entryFile);
  if (!handle) {
    throw new Error(`${entryFile} did not call Deno.serve`);
  }

  return { handle, calls, loggedErrors };
}
