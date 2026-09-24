import { mmkvInstance } from '../../stores/mmkvStorage';

/**
 * A persisted "a daily reminder may be scheduled on this device" flag.
 *
 * A reminder turned off must never keep firing, so the reconciler used to load the
 * notification service (~120 modules) on every launch just to cancel one that might
 * be left over. The flag lets it skip that when nothing can be: it is set before a
 * reminder is scheduled and cleared only after a cancel succeeded. Anything unknown
 * counts as "may be scheduled": an install from before the flag existed, cleared
 * storage, or a read that fails. The worst case is one harmless cancel.
 */
const DAILY_REMINDER_MAY_BE_SCHEDULED_KEY = 'daily-reminder-may-be-scheduled';

export function mayDailyReminderBeScheduled(): boolean {
  try {
    return mmkvInstance.getString(DAILY_REMINDER_MAY_BE_SCHEDULED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function markDailyReminderMayBeScheduled(): void {
  try {
    mmkvInstance.set(DAILY_REMINDER_MAY_BE_SCHEDULED_KEY, '1');
  } catch {
    // A stale "cleared" must not survive a schedule: a missing flag also reads as "may be".
    try {
      mmkvInstance.delete(DAILY_REMINDER_MAY_BE_SCHEDULED_KEY);
    } catch {
      // Nothing more to do; the reminder itself is still scheduled normally.
    }
  }
}

export function markDailyReminderCancelled(): void {
  try {
    mmkvInstance.set(DAILY_REMINDER_MAY_BE_SCHEDULED_KEY, '0');
  } catch {
    // Left as it was: at worst the next launch cancels once more.
  }
}
