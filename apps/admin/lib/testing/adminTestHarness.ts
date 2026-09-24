/**
 * Loader support for behavioural tests of the admin app's real server modules.
 *
 * The admin app imports its own files through the `@/` path alias, which tsx
 * only resolves from apps/admin/tsconfig.json. The workspace test runner starts
 * at the repo root, so this module registers an in-thread resolve hook that maps
 * `@/x` to `apps/admin/x(.ts|.tsx|/index.ts)`. Importing this module first also
 * lets `mock.module('@/lib/...')` intercept every importer of that file.
 *
 * Usage (one mock configuration per file, as in docs/testing.md):
 *
 *   import { createSupabaseFake, mockModule, mockNextServerRuntime } from '../testing/adminTestHarness';
 *   const service = createSupabaseFake();
 *   mockModule(mock, '@/lib/supabase/service', { createAdminServiceClient: () => service.client });
 *   const next = mockNextServerRuntime(mock);
 *   const { someAction } = await import('../../app/(dashboard)/actions');
 */
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import type { MockTracker } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as supabaseFakeModule from '../../../../src/testing/supabaseFake';

export const ADMIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ALIAS_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveAdminAlias(specifier: string): string | null {
  const base = `${ADMIN_ROOT}${specifier.slice(2)}`;
  for (const suffix of ALIAS_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = resolveAdminAlias(specifier);
      if (resolved) {
        return nextResolve(resolved, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

type ModuleMockOptions = Parameters<MockTracker['module']>[1];

/**
 * Same contract as `src/testing/mockModules.mockModule`: Node 26 takes
 * `{ exports }`, CI's Node 22 takes `namedExports` / `defaultExport`.
 */
export function mockModule(
  mocker: MockTracker,
  specifier: string,
  exports: Record<string, unknown>
): ReturnType<MockTracker['module']> {
  if (Number(process.versions.node.split('.')[0]) < 26) {
    const { default: defaultExport, ...namedExports } = exports;
    return mocker.module(specifier, {
      namedExports,
      ...('default' in exports ? { defaultExport } : {}),
    });
  }
  return mocker.module(specifier, { exports } as unknown as ModuleMockOptions);
}

// src/testing is compiled as CommonJS (the repo root has no "type": "module"),
// so an ESM importer sees its exports on the namespace's default export.
type SupabaseFakeModule = typeof supabaseFakeModule;
const fakeModule: SupabaseFakeModule =
  (supabaseFakeModule as SupabaseFakeModule & { default?: SupabaseFakeModule }).default ??
  supabaseFakeModule;

export const createSupabaseFake: SupabaseFakeModule['createSupabaseFake'] =
  fakeModule.createSupabaseFake;
export const makeFakeUser: SupabaseFakeModule['makeFakeUser'] = fakeModule.makeFakeUser;
export type SupabaseFake = ReturnType<SupabaseFakeModule['createSupabaseFake']>;
export type SupabaseQueryCall = supabaseFakeModule.SupabaseQueryCall;

/** Thrown by the mocked `redirect()`; Next's real one also throws to stop the action. */
export class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

/**
 * Replaces the Next.js server runtime a server action or route handler touches.
 * `redirect` throws a RedirectSignal; `revalidatePath` and `revalidateTag` are
 * recorded; `NextResponse` is the platform Response (it has the same `json`
 * factory).
 */
export function mockNextServerRuntime(mocker: MockTracker) {
  const revalidatedPaths: string[] = [];
  const revalidatedTags: string[] = [];
  mockModule(mocker, 'next/navigation', {
    redirect: (url: string): never => {
      throw new RedirectSignal(url);
    },
  });
  mockNextCache(mocker, { revalidatedPaths, revalidatedTags });
  mockModule(mocker, 'next/server', { NextResponse: Response });
  return { revalidatedPaths, revalidatedTags };
}

export interface UnstableCacheCall {
  keyParts: string[];
  options: { revalidate?: number | false; tags?: string[] };
}

/**
 * Replaces `next/cache` for code loaded outside a Next.js server. The real
 * `unstable_cache` throws there (no incremental cache), so this one runs the
 * callback every time and records how it was configured.
 */
export function mockNextCache(
  mocker: MockTracker,
  recorded: { revalidatedPaths?: string[]; revalidatedTags?: string[] } = {}
) {
  const cacheCalls: UnstableCacheCall[] = [];
  mockModule(mocker, 'next/cache', {
    revalidatePath: (path: string) => {
      recorded.revalidatedPaths?.push(path);
    },
    revalidateTag: (tag: string) => {
      recorded.revalidatedTags?.push(tag);
    },
    unstable_cache:
      <T extends (...args: never[]) => Promise<unknown>>(
        callback: T,
        keyParts: string[] = [],
        options: UnstableCacheCall['options'] = {}
      ) =>
      (...args: Parameters<T>) => {
        cacheCalls.push({ keyParts, options });
        return callback(...args);
      },
  });
  return { cacheCalls };
}

/** Runs `callback` and returns the URL it redirected to, failing if it did not redirect. */
export async function captureRedirect(callback: () => Promise<unknown>): Promise<string> {
  try {
    await callback();
  } catch (error) {
    if (error instanceof RedirectSignal) {
      return error.url;
    }
    throw error;
  }
  throw new Error('Expected a redirect');
}

/** Builds the FormData a server action receives from an HTML form. */
export function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

/** A step recorded on a query builder, e.g. `stepArgs(call, 'eq')` → [['id', 'user-1']]. */
export function stepArgs(call: SupabaseQueryCall, method: string): unknown[][] {
  return call.steps.filter((step) => step.method === method).map((step) => step.args);
}
