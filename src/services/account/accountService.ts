import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';

export interface AccountActionResult {
  success: boolean;
  error?: string;
}

// Buckets that hold per-user files under a `{userId}/` prefix. delete_my_account() removes
// the auth user and cascades the tables, but Postgres cannot delete storage objects, so the
// avatar and any recorded feedback audio are removed here first (audit 2026-09-24 L9).
const USER_OWNED_BUCKETS = ['avatars', 'chapter-feedback-audio'] as const;
const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

/** Every object path under `folder`, walking sub-folders (storage lists one level at a time). */
const listObjectPaths = async (bucket: string, folder: string): Promise<string[]> => {
  const paths: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw new Error(error.message);
    }

    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${folder}/${entry.name}`;
      // Folder placeholders come back without an object id.
      if (entry.id == null) {
        paths.push(...(await listObjectPaths(bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (entries.length < LIST_PAGE_SIZE) {
      return paths;
    }
  }
};

const removeUserFiles = async (userId: string): Promise<void> => {
  for (const bucket of USER_OWNED_BUCKETS) {
    const paths = await listObjectPaths(bucket, userId);

    for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(paths.slice(index, index + REMOVE_BATCH_SIZE));

      if (error) {
        throw new Error(error.message);
      }
    }
  }
};

export const deleteCurrentAccount = async (): Promise<AccountActionResult> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'EveryBible backend is not configured for this build yet.' };
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Not signed in' };
    }

    // Files first: once the account is gone the user can no longer reach them to retry.
    await removeUserFiles(userId);

    const { error } = await supabase.rpc('delete_my_account');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
