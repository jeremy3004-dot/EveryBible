import * as FileSystem from 'expo-file-system';
import { supabase, isSupabaseConfigured, getCurrentUserId } from '../supabase';

export interface StorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

const AVATAR_BUCKET = 'avatars';
const GROUP_IMAGE_BUCKET = 'group-images';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the file extension from a URI.  Falls back to 'jpg' for URIs
 * that carry no recognisable extension (e.g. content:// on Android).
 */
const getExtension = (uri: string): string => {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : 'jpg';
};

/**
 * Map a common image extension to the corresponding MIME type.
 */
const mimeTypeFor = (ext: string): string => {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return map[ext] ?? 'image/jpeg';
};

/**
 * Read a local image URI as a Uint8Array, which is what the Supabase JS client
 * expects when uploading binary data from React Native.
 *
 * expo-file-system returns a base64 string; we decode it without any
 * additional dependency by using the global `atob` available in Hermes / JSC.
 */
const readImageAsUint8Array = async (uri: string): Promise<Uint8Array> => {
  // Pass the literal 'base64' – EncodingType enum is not exported from the
  // top-level expo-file-system index in SDK 54, so we use the accepted string form.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as const,
  });

  // eslint-disable-next-line no-undef
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

/**
 * Upload a profile avatar for the currently authenticated user.
 * The image is stored at `{userId}/avatar.{ext}` inside the avatars bucket.
 * Returns the public URL for the uploaded file.
 */
export const uploadAvatar = async (imageUri: string): Promise<StorageResult<string>> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const ext = getExtension(imageUri);
    const contentType = mimeTypeFor(ext);
    const storagePath = `${userId}/avatar.${ext}`;
    const imageBytes = await readImageAsUint8Array(imageUri);

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, imageBytes, {
        contentType,
        upsert: true, // overwrite any existing avatar
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);

    return { success: true, data: data.publicUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Delete the current user's avatar from storage.
 * Attempts to remove both .jpg and .png variants so stale files are cleaned up
 * even when the extension has changed between uploads.
 */
export const deleteAvatar = async (): Promise<StorageResult> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    // List all files in the user's avatar folder so we delete whatever extension is there
    const { data: files, error: listError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(userId);

    if (listError) {
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      // Nothing to delete – treat as success
      return { success: true };
    }

    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);

    if (removeError) {
      return { success: false, error: removeError.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Derive the public URL for a user's avatar without a network round-trip.
 * The URL is constructed from the known storage path convention; if the user
 * has no avatar the URL will 404 gracefully when rendered in an <Image>.
 *
 * Falls back to null when Supabase is not configured so callers can show a
 * placeholder avatar without crashing.
 */
export const getAvatarUrl = (userId: string): string | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  // We don't know the extension without an extra list call, so we check jpg
  // which is the most common output from image pickers.  Callers that stored
  // the URL from uploadAvatar should prefer that cached value instead.
  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(`${userId}/avatar.jpg`);

  return data.publicUrl;
};

// ─── Group Images ─────────────────────────────────────────────────────────────

/**
 * Upload a cover image for a group.  Only the group leader should call this;
 * enforce that constraint via Supabase RLS in addition to any UI-layer guards.
 * The image is stored at `{groupId}/cover.{ext}` inside the group-images bucket.
 * Returns the public URL for the uploaded file.
 */
export const uploadGroupImage = async (
  groupId: string,
  imageUri: string
): Promise<StorageResult<string>> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const ext = getExtension(imageUri);
    const contentType = mimeTypeFor(ext);
    const storagePath = `${groupId}/cover.${ext}`;
    const imageBytes = await readImageAsUint8Array(imageUri);

    const { error: uploadError } = await supabase.storage
      .from(GROUP_IMAGE_BUCKET)
      .upload(storagePath, imageBytes, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage.from(GROUP_IMAGE_BUCKET).getPublicUrl(storagePath);

    return { success: true, data: data.publicUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Remove all cover images for a group.  Cleans up every file variant so
 * extension changes from previous uploads don't leave orphaned objects.
 */
export const deleteGroupImage = async (groupId: string): Promise<StorageResult> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(GROUP_IMAGE_BUCKET)
      .list(groupId);

    if (listError) {
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { success: true };
    }

    const paths = files.map((f) => `${groupId}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(GROUP_IMAGE_BUCKET).remove(paths);

    if (removeError) {
      return { success: false, error: removeError.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

/**
 * Derive the public URL for a group's cover image without a network round-trip.
 * Same caveat as getAvatarUrl: callers with a cached URL from uploadGroupImage
 * should use that value instead to avoid the extension assumption.
 */
export const getGroupImageUrl = (groupId: string): string | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data } = supabase.storage
    .from(GROUP_IMAGE_BUCKET)
    .getPublicUrl(`${groupId}/cover.jpg`);

  return data.publicUrl;
};
