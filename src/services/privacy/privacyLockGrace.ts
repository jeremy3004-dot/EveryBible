/**
 * Discreet mode locks when the app goes 'inactive', because that is how iOS starts both
 * the app switcher (whose snapshot must not show scripture) and leaving the app. iOS
 * also turns the app inactive under system UI the app raises itself: the alert after an
 * app icon change, a permission prompt. Locking there locked the reader out mid-task
 * (turning discreet mode on locked the app at once) and remounted the navigator.
 *
 * So system UI the app raises runs through `withPrivacyLockGrace`, and while it is open,
 * and briefly after it settles, going 'inactive' does not lock. Going to the background
 * always locks, and so does backgrounding after an ignored inactive (see usePrivacyLock),
 * so the grace never keeps content visible outside the app.
 *
 * It covers short, self-contained system UI that hands straight back to the same screen:
 * the icon alert, permission prompts (notifications, microphone) and the photo picker.
 * Share sheets stay outside it on purpose: they stay open as long as the reader likes,
 * over scripture and previewing it, while a pending grace would keep an app-switcher
 * 'inactive' from locking for up to 10s. If one does turn the app inactive, discreet
 * mode fails closed and locks.
 */

/** How long after the app's own system UI settles its 'inactive' echo is still ignored. */
export const PRIVACY_LOCK_GRACE_AFTER_SYSTEM_UI_MS = 1_500;
/** A request that never settles stops suppressing the lock after this long. */
export const PRIVACY_LOCK_GRACE_MAX_PENDING_MS = 10_000;

const pendingSince = new Set<{ startedAt: number }>();
let graceUntil = 0;

/** Runs a task that shows system UI (an icon alert, a permission prompt) under the grace. */
export async function withPrivacyLockGrace<T>(task: () => Promise<T>): Promise<T> {
  const entry = { startedAt: Date.now() };
  pendingSince.add(entry);
  try {
    return await task();
  } finally {
    pendingSince.delete(entry);
    graceUntil = Math.max(graceUntil, Date.now() + PRIVACY_LOCK_GRACE_AFTER_SYSTEM_UI_MS);
  }
}

/** Whether system UI the app raised itself explains the app going 'inactive' right now. */
export function isPrivacyLockGraceActive(): boolean {
  const now = Date.now();
  if (now < graceUntil) {
    return true;
  }
  for (const entry of pendingSince) {
    if (now - entry.startedAt < PRIVACY_LOCK_GRACE_MAX_PENDING_MS) {
      return true;
    }
  }
  return false;
}
