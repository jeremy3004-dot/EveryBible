// Stands in for `https://esm.sh/@supabase/supabase-js@2` when edgeFunctionHarness loads an edge
// function under Node. The harness maps that URL here with a resolve hook; every `createClient`
// call returns the client of the harness whose request is currently being handled.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface EdgeRequestScope {
  client: unknown;
  env: Record<string, string | undefined>;
  loggedErrors: string[];
  fetch: typeof fetch;
}

export const edgeRequestScope = new AsyncLocalStorage<EdgeRequestScope>();

export function activeEdgeScope(): EdgeRequestScope {
  const scope = edgeRequestScope.getStore();
  if (!scope) {
    throw new Error('Edge function code ran outside an edgeFunctionHarness request');
  }
  return scope;
}

export const createClient = (..._args: unknown[]): unknown => activeEdgeScope().client;

// Type-only imports of SupabaseClient are erased; this keeps value-position references loadable.
export type SupabaseClient = unknown;
