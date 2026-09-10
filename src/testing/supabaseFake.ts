/**
 * Recording fake for the Supabase client used by service and store tests.
 *
 * Why a fake instead of the real client: services talk to Supabase through a
 * thenable query builder, `auth`, `storage`, `rpc`, and `functions`. Tests need
 * to (a) observe exactly what a service asked for and (b) script the answer,
 * without any network. This fake records every call and lets each test install
 * per-table / per-rpc / per-function responders.
 *
 * Usage:
 *   const fake = createSupabaseFake();
 *   fake.respondTo('profiles', ({ operation, filters }) => ({ data: [...] }));
 *   mockSupabaseModule(mock, fake);            // see ./mockModules
 *   const service = await import('./myService');
 *   ...
 *   assert.equal(fake.calls[0].table, 'profiles');
 */
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface SupabaseFakeError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

export interface SupabaseFakeResult<T = unknown> {
  data?: T;
  error?: SupabaseFakeError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

export interface SupabaseQueryStep {
  method: string;
  args: unknown[];
}

export interface SupabaseQueryCall {
  table: string;
  operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc' | null;
  /** Row(s) passed to insert / upsert / update, or rpc args. */
  payload?: unknown;
  /** Second argument to insert / upsert / update / delete (e.g. `{ onConflict }`). */
  options?: unknown;
  /** Column list passed to `.select()`, if any. */
  columns?: string;
  /** Every chained builder method in call order (eq, in, order, limit, single, ...). */
  steps: SupabaseQueryStep[];
  single: boolean;
  maybeSingle: boolean;
}

export type SupabaseResponder = (
  call: SupabaseQueryCall
) => SupabaseFakeResult | Promise<SupabaseFakeResult>;

export type SupabaseFunctionResponder = (
  name: string,
  options: unknown
) => SupabaseFakeResult | Promise<SupabaseFakeResult>;

export interface SupabaseStorageCall {
  bucket: string;
  method: string;
  args: unknown[];
}

export interface SupabaseAuthCall {
  method: string;
  args: unknown[];
}

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

/** Shape of a Supabase auth error as services see it (`error.message`, optional code/status). */
export interface SupabaseAuthErrorLike {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}

type AuthResult<T> = Promise<{ data: T; error: SupabaseAuthErrorLike | null }>;
type UserSessionData = { user: User | null; session: Session | null };

/**
 * Every auth method is overridable per test, e.g.
 * `fake.auth.handlers.signInWithPassword = async () => ({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } })`.
 * Result types are deliberately wide so error scenarios need no casts.
 */
export interface SupabaseAuthHandlers {
  getUser: () => AuthResult<{ user: User | null }>;
  getSession: () => AuthResult<{ session: Session | null }>;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => AuthResult<UserSessionData>;
  signUp: (credentials: unknown) => AuthResult<UserSessionData>;
  signInWithIdToken: (credentials: unknown) => AuthResult<UserSessionData>;
  signOut: (options?: unknown) => Promise<{ error: SupabaseAuthErrorLike | null }>;
  setSession: (session: {
    access_token: string;
    refresh_token: string;
  }) => AuthResult<UserSessionData>;
  refreshSession: (session?: unknown) => AuthResult<UserSessionData>;
  updateUser: (attributes: unknown) => AuthResult<{ user: User | null }>;
  resetPasswordForEmail: (
    email: string,
    options?: unknown
  ) => AuthResult<Record<string, never> | null>;
  exchangeCodeForSession: (code: string) => AuthResult<UserSessionData>;
  startAutoRefresh: () => Promise<void>;
  stopAutoRefresh: () => Promise<void>;
}

const FILTER_METHODS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'overlaps',
  'textSearch',
  'match',
  'not',
  'or',
  'filter',
  'order',
  'limit',
  'range',
  'abortSignal',
  'throwOnError',
  'returns',
  'csv',
] as const;

const DEFAULT_RESPONDER: SupabaseResponder = (call) => ({
  data: call.single || call.maybeSingle ? null : [],
  error: null,
  count: null,
});

export const makeFakeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'reader@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as User;

export const makeFakeSession = (overrides: Partial<Session> = {}): Session =>
  ({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: makeFakeUser(),
    ...overrides,
  }) as Session;

export function createSupabaseFake() {
  const calls: SupabaseQueryCall[] = [];
  const storageCalls: SupabaseStorageCall[] = [];
  const authCalls: SupabaseAuthCall[] = [];
  const functionCalls: Array<{ name: string; options: unknown }> = [];
  const responders = new Map<string, SupabaseResponder>();
  const storageResponders = new Map<string, (...args: unknown[]) => unknown>();
  const listeners = new Set<AuthListener>();
  let functionResponder: SupabaseFunctionResponder = () => ({ data: null, error: null });
  let defaultResponder: SupabaseResponder = DEFAULT_RESPONDER;

  const authState: { session: Session | null; user: User | null } = { session: null, user: null };

  const resolveResult = async (call: SupabaseQueryCall): Promise<SupabaseFakeResult> => {
    const responder = responders.get(call.table) ?? defaultResponder;
    const result = await responder(call);
    return { error: null, count: null, status: 200, statusText: 'OK', ...result };
  };

  const createBuilder = (table: string, operation: SupabaseQueryCall['operation']) => {
    const call: SupabaseQueryCall = {
      table,
      operation,
      steps: [],
      single: false,
      maybeSingle: false,
    };
    calls.push(call);

    const builder: Record<string, unknown> = {};
    const record = (method: string, args: unknown[]) => {
      call.steps.push({ method, args });
      return builder;
    };

    builder.select = (columns?: string, options?: unknown) => {
      if (call.operation === null) {
        call.operation = 'select';
      }
      call.columns = columns ?? '*';
      return record('select', options === undefined ? [columns] : [columns, options]);
    };
    for (const op of ['insert', 'upsert', 'update'] as const) {
      builder[op] = (payload: unknown, options?: unknown) => {
        call.operation = op;
        call.payload = payload;
        call.options = options;
        return record(op, [payload, options]);
      };
    }
    builder.delete = (options?: unknown) => {
      call.operation = 'delete';
      call.options = options;
      return record('delete', [options]);
    };
    builder.single = () => {
      call.single = true;
      return record('single', []);
    };
    builder.maybeSingle = () => {
      call.maybeSingle = true;
      return record('maybeSingle', []);
    };
    for (const method of FILTER_METHODS) {
      builder[method] = (...args: unknown[]) => record(method, args);
    }
    builder.then = (
      onFulfilled?: (value: SupabaseFakeResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => resolveResult(call).then(onFulfilled, onRejected);
    builder.catch = (onRejected?: (reason: unknown) => unknown) =>
      resolveResult(call).catch(onRejected);
    builder.finally = (onFinally?: () => void) => resolveResult(call).finally(onFinally);

    return builder;
  };

  const emitAuth = (event: AuthChangeEvent, session: Session | null) => {
    for (const listener of listeners) {
      listener(event, session);
    }
  };

  const recordAuth = (method: string, args: unknown[]) => {
    authCalls.push({ method, args });
  };

  const authHandlers: SupabaseAuthHandlers = {
    getUser: async () => ({ data: { user: authState.user }, error: null }),
    getSession: async () => ({ data: { session: authState.session }, error: null }),
    signInWithPassword: async () => ({
      data: { user: authState.user, session: authState.session },
      error: null,
    }),
    signUp: async () => ({
      data: { user: authState.user, session: authState.session },
      error: null,
    }),
    signInWithIdToken: async () => ({
      data: { user: authState.user, session: authState.session },
      error: null,
    }),
    signOut: async () => {
      fake.auth.setSession(null);
      emitAuth('SIGNED_OUT', null);
      return { error: null };
    },
    setSession: async (session) => {
      const next = makeFakeSession({ ...authState.session, ...session } as Partial<Session>);
      fake.auth.setSession(next);
      return { data: { session: next, user: next.user }, error: null };
    },
    refreshSession: async () => ({
      data: { session: authState.session, user: authState.user },
      error: null,
    }),
    updateUser: async () => ({ data: { user: authState.user }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    exchangeCodeForSession: async () => ({
      data: { session: authState.session, user: authState.user },
      error: null,
    }),
    startAutoRefresh: async () => undefined,
    stopAutoRefresh: async () => undefined,
  };

  const defaultAuthHandlers = { ...authHandlers };

  const auth = new Proxy({} as Record<string, unknown>, {
    get(_target, property: string) {
      if (property === 'onAuthStateChange') {
        return (listener: AuthListener) => {
          recordAuth('onAuthStateChange', []);
          listeners.add(listener);
          return {
            data: {
              subscription: {
                id: `sub-${listeners.size}`,
                callback: listener,
                unsubscribe: () => {
                  listeners.delete(listener);
                },
              },
            },
          };
        };
      }
      const handler = (fake.auth.handlers as unknown as Record<string, unknown>)[property];
      if (typeof handler === 'function') {
        return (...args: unknown[]) => {
          recordAuth(property, args);
          return (handler as (...a: unknown[]) => unknown)(...args);
        };
      }
      return handler;
    },
  });

  const storage = {
    from: (bucket: string) => {
      const record = (method: string, args: unknown[]) => {
        storageCalls.push({ bucket, method, args });
        const responder = storageResponders.get(`${bucket}:${method}`);
        return responder ? responder(...args) : undefined;
      };
      return {
        upload: async (...args: unknown[]) =>
          record('upload', args) ?? { data: { path: String(args[0]) }, error: null },
        update: async (...args: unknown[]) =>
          record('update', args) ?? { data: { path: String(args[0]) }, error: null },
        remove: async (...args: unknown[]) => record('remove', args) ?? { data: [], error: null },
        download: async (...args: unknown[]) =>
          record('download', args) ?? { data: null, error: null },
        list: async (...args: unknown[]) => record('list', args) ?? { data: [], error: null },
        createSignedUrl: async (...args: unknown[]) =>
          record('createSignedUrl', args) ?? {
            data: {
              signedUrl: `${fake.storage.publicUrlBase}/${bucket}/${String(args[0])}?signed`,
            },
            error: null,
          },
        getPublicUrl: (...args: unknown[]) =>
          record('getPublicUrl', args) ?? {
            data: { publicUrl: `${fake.storage.publicUrlBase}/${bucket}/${String(args[0])}` },
          },
      };
    },
  };

  const channels: Array<{ name: string; removed: boolean }> = [];

  const client = {
    from: (table: string) => createBuilder(table, null),
    rpc: (fn: string, args?: unknown, options?: unknown) => {
      const builder = createBuilder(`rpc:${fn}`, 'rpc');
      const call = calls[calls.length - 1];
      call.payload = args;
      call.options = options;
      return builder;
    },
    auth,
    storage,
    functions: {
      invoke: async (name: string, options?: unknown) => {
        functionCalls.push({ name, options });
        const result = await functionResponder(name, options);
        return { data: null, error: null, ...result };
      },
    },
    channel: (name: string) => {
      const record = { name, removed: false };
      channels.push(record);
      const channel = {
        on: () => channel,
        subscribe: (callback?: (status: string) => void) => {
          callback?.('SUBSCRIBED');
          return channel;
        },
        unsubscribe: async () => {
          record.removed = true;
          return 'ok';
        },
      };
      return channel;
    },
    removeChannel: async (channel: { name?: string }) => {
      const record = channels.find((entry) => entry.name === channel?.name);
      if (record) {
        record.removed = true;
      }
      return 'ok';
    },
  };

  const fake = {
    client: client as unknown as SupabaseClient,
    calls,
    storageCalls,
    authCalls,
    functionCalls,
    channels,
    /** Calls recorded for one table (or `rpc:<fn>`), in order. */
    callsFor: (table: string) => calls.filter((call) => call.table === table),
    /** Script the result for every query against `table` (or `rpc:<fn>`). */
    respondTo: (table: string, responder: SupabaseResponder) => {
      responders.set(table, responder);
    },
    /** Script the result for a Postgres function invoked through `.rpc(fn)`. */
    respondToRpc: (fn: string, responder: SupabaseResponder) => {
      responders.set(`rpc:${fn}`, responder);
    },
    /** Fallback responder for tables without an explicit one. */
    setDefaultResponder: (responder: SupabaseResponder) => {
      defaultResponder = responder;
    },
    respondToFunction: (responder: SupabaseFunctionResponder) => {
      functionResponder = responder;
    },
    storage: {
      publicUrlBase: 'https://storage.example.test/storage/v1/object/public',
      respond: (bucket: string, method: string, responder: (...args: unknown[]) => unknown) => {
        storageResponders.set(`${bucket}:${method}`, responder);
      },
    },
    auth: {
      /** Override any auth method for one test: `fake.auth.handlers.signUp = async () => ...`. */
      handlers: authHandlers,
      get session() {
        return authState.session;
      },
      get user() {
        return authState.user;
      },
      /** Set the "current" session (and user) that getSession / getUser report. */
      setSession: (session: Session | null) => {
        authState.session = session;
        authState.user = session?.user ?? null;
      },
      setUser: (user: User | null) => {
        authState.user = user;
      },
      /** Fire an auth state change to every onAuthStateChange subscriber. */
      emit: emitAuth,
      get listenerCount() {
        return listeners.size;
      },
    },
    /** Forget recorded calls, scripted responders, and auth handler overrides; keep auth state. */
    reset: () => {
      Object.assign(authHandlers, defaultAuthHandlers);
      calls.length = 0;
      storageCalls.length = 0;
      authCalls.length = 0;
      functionCalls.length = 0;
      channels.length = 0;
      responders.clear();
      storageResponders.clear();
      defaultResponder = DEFAULT_RESPONDER;
      functionResponder = () => ({ data: null, error: null });
    },
  };

  return fake;
}

export type SupabaseFake = ReturnType<typeof createSupabaseFake>;
