import { useAuthStore } from '../../stores/authStore';
import { deletePrivateDataOf } from '../../stores/privateDataScope';
import { anonymiseQueuedUsageEventsOf } from '../analytics/usageQueue';
import { discardQueuedChapterFeedbackOf } from '../feedback/chapterFeedbackOutbox';
import { deleteCurrentAccount, type AccountActionResult } from './accountService';

/**
 * Deletes the signed-in account on the server, signs out, and removes that
 * account's data from this device, including chapter feedback it queued offline.
 *
 * Only the deleted account's data goes. A phone can be shared: other accounts'
 * private notes and the signed-out (guest) notes live in their own buckets and
 * stay. Signing out already resets the per-account reading state and
 * preferences; what is left is the account's private bucket, deleted here.
 * Device-wide data (downloaded translations and audio, the app lock) belongs to
 * whoever uses the phone and is kept too.
 */
export async function deleteAccountAndLocalData(
  expectedUserId?: string,
  expectedGeneration?: number
): Promise<AccountActionResult> {
  const start = useAuthStore.getState();
  const userId = expectedUserId ?? start.user?.uid ?? null;
  const authGeneration = expectedGeneration ?? start.authGeneration;
  if (!userId) {
    return { success: false, error: 'Not signed in' };
  }

  const isCurrent = () => {
    const current = useAuthStore.getState();
    return current.user?.uid === userId && current.authGeneration === authGeneration;
  };
  if (!isCurrent()) return { success: false, error: 'Account changed' };
  const result = await deleteCurrentAccount(userId, isCurrent);
  if (!result.success) {
    return result;
  }

  try {
    if (isCurrent()) {
      await useAuthStore.getState().signOut({ expectedOwner: { uid: userId, authGeneration } });
    }
  } finally {
    // The account is gone on the server whatever sign-out did. Anonymising
    // after sign-out also covers events queued while sign-out was running.
    deletePrivateDataOf(userId);
    anonymiseQueuedUsageEventsOf(userId);
    discardQueuedChapterFeedbackOf(userId);
  }
  return { success: true };
}
