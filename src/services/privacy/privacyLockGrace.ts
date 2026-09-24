/**
 * Discreet mode locks when the app goes 'inactive', because that is how iOS starts both
 * the app switcher (whose snapshot must not show scripture) and leaving the app. iOS
 * also turns the app inactive under system UI the app raises itself: the alert after an
 * app icon change, a permission prompt. Locking there locked the reader out mid-task
 * (turning discreet mode on locked the app at once) and remounted the navigator.
 *
 * So system UI the app raises runs through `withPrivacyLockGrace`, and while it is open,
 * and briefly after it settles, going 'inactive' does not lock. Going to the background
 * always locks on iOS, and so does backgrounding after an ignored inactive (see
 * usePrivacyLock), so the grace never keeps content visible outside the app. Android's
 * exception, for its own prompts only, is below.
 *
 * Android has no 'inactive': the app's own permission dialog pauses the activity and
 * AppState reports 'background'. There, and only while a request run through
 * `withPrivacyLockGrace` is still open (not in the settle tail, so leaving the app right
 * after a prompt still locks), a 'background' may wait until the request's cap: returning
 * to 'active' before it cancels the lock, and reaching it while still away locks (on
 * return at the latest, since Android pauses JS timers in the background).
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
/**
 * A request that never settles stops suppressing the lock after this long, and so does a
 * grace held for an alert that follows the request (`untilNextActive`) but never came.
 */
export const PRIVACY_LOCK_GRACE_MAX_PENDING_MS = 10_000;

export interface PrivacyLockGraceOptions {
  /**
   * The system UI can come after the task settles: iOS completes an app icon change
   * first and shows its alert (turning the app inactive) over a second later, 1.5 s was
   * not enough on an iOS 26.5 simulator. The grace then stays until the app is next
   * active again, capped at PRIVACY_LOCK_GRACE_MAX_PENDING_MS, unless the app already
   * went inactive while the task ran.
   */
  untilNextActive?: boolean;
}

type PendingGrace = { startedAt: number; sawInactive: boolean };

const pendingSince = new Set<PendingGrace>();
let graceUntil = 0;
let heldUntilActiveSince: number | null = null;

/** Runs a task that shows system UI (an icon alert, a permission prompt) under the grace. */
export async function withPrivacyLockGrace<T>(
  task: () => Promise<T>,
  options: PrivacyLockGraceOptions = {}
): Promise<T> {
  const entry: PendingGrace = { startedAt: Date.now(), sawInactive: false };
  pendingSince.add(entry);
  try {
    return await task();
  } finally {
    pendingSince.delete(entry);
    const settledAt = Date.now();
    graceUntil = Math.max(graceUntil, settledAt + PRIVACY_LOCK_GRACE_AFTER_SYSTEM_UI_MS);
    if (options.untilNextActive && !entry.sawInactive) {
      heldUntilActiveSince = settledAt;
    }
  }
}

/**
 * Told every app state change (by usePrivacyLock). Returning to 'active' ends a grace held
 * until then; going 'inactive' is recorded against the requests still pending.
 */
export function notePrivacyLockAppState(nextState: string): void {
  if (nextState === 'active') {
    heldUntilActiveSince = null;
  } else if (nextState === 'inactive') {
    pendingSince.forEach((entry) => {
      entry.sawInactive = true;
    });
  }
}

/** Whether system UI the app raised itself explains the app going 'inactive' right now. */
export function isPrivacyLockGraceActive(): boolean {
  const now = Date.now();
  if (now < graceUntil) {
    return true;
  }
  if (
    heldUntilActiveSince !== null &&
    now - heldUntilActiveSince < PRIVACY_LOCK_GRACE_MAX_PENDING_MS
  ) {
    return true;
  }
  for (const entry of pendingSince) {
    if (now - entry.startedAt < PRIVACY_LOCK_GRACE_MAX_PENDING_MS) {
      return true;
    }
  }
  return false;
}

/**
 * While a request run through `withPrivacyLockGrace` is still open (and under the cap),
 * the time until which its system UI may keep the app out of the foreground; otherwise
 * null. Only Android uses it, for the 'background' its permission dialogs cause.
 */
export function getPendingPrivacyLockGraceDeadline(): number | null {
  const now = Date.now();
  let deadline: number | null = null;
  for (const entry of pendingSince) {
    const end = entry.startedAt + PRIVACY_LOCK_GRACE_MAX_PENDING_MS;
    if (end > now && (deadline === null || end > deadline)) {
      deadline = end;
    }
  }
  return deadline;
}
