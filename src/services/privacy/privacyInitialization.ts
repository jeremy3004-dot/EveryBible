import type { StoredPrivacySettings } from '../../types';

export const DEFAULT_PRIVACY_INITIALIZATION_TIMEOUT_MS = 3_500;

export type PrivacySettingsLoader = () => Promise<StoredPrivacySettings>;

export type PrivacyInitializationResult =
  | { status: 'ready'; settings: StoredPrivacySettings }
  | { status: 'timeout' }
  | { status: 'unavailable'; error: unknown };

export async function initializePrivacyWithTimeout(
  load: PrivacySettingsLoader,
  timeoutMs = DEFAULT_PRIVACY_INITIALIZATION_TIMEOUT_MS
): Promise<PrivacyInitializationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const loadPromise = Promise.resolve()
    .then(load)
    .then((settings): PrivacyInitializationResult => ({ status: 'ready', settings }));
  const timeoutPromise = new Promise<PrivacyInitializationResult>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });

  try {
    return await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    return { status: 'unavailable', error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
