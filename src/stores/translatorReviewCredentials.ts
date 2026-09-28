import * as SecureStore from 'expo-secure-store';
import { mmkvInstance } from './mmkvStorage';

const blockKey = (key: string) => `feedback-credential-block:${key}`;
const revisions = new Map<string, number>();
const revisionOf = (key: string) => revisions.get(key) ?? 0;

function isBlocked(key: string): boolean {
  try {
    return mmkvInstance.getString(blockKey(key)) !== undefined;
  } catch {
    return true;
  }
}

function admitChange(key: string): number | null {
  const revision = revisionOf(key) + 1;
  revisions.set(key, revision);
  try {
    // Only this nonsecret marker is durable outside the OS credential store.
    mmkvInstance.set(blockKey(key), '1');
    return revision;
  } catch {
    return null;
  }
}

function reportSafely(report: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    report?.(error);
  } catch {
    // Reporting cannot reject detached credential work.
  }
}

export function writeFeedbackAccessCredential(
  key: string,
  passcode: string,
  report?: (error: unknown) => void
): boolean {
  const revision = admitChange(key);
  if (revision === null) {
    reportSafely(report, new Error('Feedback credential protection could not be stored'));
    return false;
  }
  void (async () => {
    try {
      await SecureStore.setItemAsync(key, passcode);
      const stored = await SecureStore.getItemAsync(key);
      if (stored === passcode && revisionOf(key) === revision) {
        mmkvInstance.delete(blockKey(key));
      }
    } catch (error) {
      reportSafely(report, error);
    }
  })();
  return true;
}

export function removeFeedbackAccessCredential(
  key: string,
  report?: (error: unknown) => void
): void {
  const revision = admitChange(key);
  if (revision === null) {
    reportSafely(report, new Error('Feedback credential protection could not be stored'));
  }
  // Even a failed marker admission must still try removing the native secret.
  void (async () => {
    try {
      await SecureStore.deleteItemAsync(key);
      const stored = await SecureStore.getItemAsync(key);
      if (stored === null && revision !== null && revisionOf(key) === revision) {
        mmkvInstance.delete(blockKey(key));
      }
    } catch (error) {
      reportSafely(report, error);
    }
  })();
}

export async function readFeedbackAccessCredential(key: string): Promise<string | null> {
  const revision = revisionOf(key);
  if (isBlocked(key)) return null;
  const stored = await SecureStore.getItemAsync(key);
  return revisionOf(key) === revision && !isBlocked(key) ? stored : null;
}
