import { useAuthStore } from '../../stores/authStore';
import { deletePrivateDataOf } from '../../stores/privateDataScope';
import { anonymiseQueuedUsageEventsOf } from '../analytics/usageQueue';
import { deleteCurrentAccount, type AccountActionResult } from './accountService';

/**
 * Deletes the signed-in account on the server, signs out, and removes that
 * account's data from this device.
 *
 * Only the deleted account's data goes. A phone can be shared: other accounts'
 * private notes and the signed-out (guest) notes live in their own buckets and
 * stay. Signing out already resets the per-account reading state and
 * preferences; what is left is the account's private bucket, deleted here.
 * Device-wide data (downloaded translations and audio, the app lock) belongs to
 * whoever uses the phone and is kept too.
 */
export async function deleteAccountAndLocalData(): Promise<AccountActionResult> {
  const userId = useAuthStore.getState().user?.uid ?? null;
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  const result = await deleteCurrentAccount();
  if (!result.success) {
    return result;
  }

  try {
    await useAuthStore.getState().signOut();
  } finally {
    // The account is gone on the server whatever sign-out did. Anonymising
    // after sign-out also covers events queued while sign-out was running.
    deletePrivateDataOf(userId);
    anonymiseQueuedUsageEventsOf(userId);
  }
  return { success: true };
}
