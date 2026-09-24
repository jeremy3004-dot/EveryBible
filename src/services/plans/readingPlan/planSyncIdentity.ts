import { createSyncIdentityBoundary, type SyncIdentityBoundary } from '../../sync/syncIdentity';

export type SupabaseModule = typeof import('../../supabase');
export type SupabaseClient = SupabaseModule['supabase'];

let supabaseModulePromise: Promise<SupabaseModule> | null = null;

/** The Supabase client, loaded on first use so the plan service stays off the startup graph. */
export async function loadSupabaseModule(): Promise<SupabaseModule> {
  if (!supabaseModulePromise) {
    supabaseModulePromise = import('../../supabase');
  }

  return supabaseModulePromise;
}

export const getAuthUserIdSnapshot = (): string | undefined => {
  try {
    const { useAuthStore } =
      require('../../../stores/authStore') as typeof import('../../../stores/authStore');
    return useAuthStore.getState().user?.uid ?? undefined;
  } catch {
    // Keep local-only plan mutations usable in non-native runtimes where the
    // auth store's native persistence adapter is unavailable.
    return undefined;
  }
};

export const getAuthGenerationSnapshot = (): number | undefined => {
  try {
    const { useAuthStore } =
      require('../../../stores/authStore') as typeof import('../../../stores/authStore');
    return useAuthStore.getState().authGeneration;
  } catch {
    return undefined;
  }
};

export async function requireSignedInUser(
  action: string
): Promise<{ user: { id: string }; error: null } | { user: null; error: string }> {
  const { supabase, isSupabaseConfigured } = await loadSupabaseModule();

  if (!isSupabaseConfigured()) {
    return { user: null, error: `Backend is not configured — cannot ${action}` };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { user: null, error: authError.message };
  }

  if (!user) {
    return { user: null, error: `You must be signed in to ${action}` };
  }

  return { user: { id: user.id }, error: null };
}

/**
 * Binds a plan sync to the signed-in account (and auth generation) it started under, after
 * confirming that account with the server. Null when there is no such account or it changed.
 */
export const capturePlanSyncIdentity = async (
  expectedUserId: string | undefined,
  action: string,
  expectedGeneration?: number
): Promise<SyncIdentityBoundary | null> => {
  const candidate = expectedUserId ?? getAuthUserIdSnapshot() ?? null;
  if (!candidate) {
    return null;
  }

  const generation = expectedGeneration ?? getAuthGenerationSnapshot();
  const getCurrentGeneration =
    generation === undefined ? undefined : () => getAuthGenerationSnapshot() ?? -1;

  if (getAuthUserIdSnapshot() !== candidate) {
    return null;
  }

  const { user } = await requireSignedInUser(action);
  if (getAuthUserIdSnapshot() !== candidate || user?.id !== candidate) {
    return null;
  }

  const boundary = createSyncIdentityBoundary(
    candidate,
    () => getAuthUserIdSnapshot() ?? null,
    generation,
    getCurrentGeneration
  );

  return (await boundary.isCurrent()) ? boundary : null;
};

/**
 * Reuses a cycle's opaque identity capability, or performs the standalone
 * remote validation supplied by the caller. The expected uid/generation check
 * keeps a capability from being applied to a different request boundary.
 */
export const resolvePlanSyncIdentity = async (
  expectedUserId: string | undefined,
  expectedGeneration: number | undefined,
  prevalidatedIdentity: SyncIdentityBoundary | undefined,
  captureIdentity: () => Promise<SyncIdentityBoundary | null>
): Promise<SyncIdentityBoundary | null> => {
  const identity = prevalidatedIdentity ?? (await captureIdentity());
  if (!identity) {
    return null;
  }

  if (
    identity.expectedUserId !== expectedUserId ||
    identity.expectedGeneration !== expectedGeneration
  ) {
    return null;
  }

  return identity;
};
