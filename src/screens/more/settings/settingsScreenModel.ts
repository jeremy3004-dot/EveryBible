/**
 * Pure rules behind the Settings screen: the reminder picker's scale and labels,
 * the passcode keypad, the feedback identity summary, and the legacy content
 * language the screen repairs on sight.
 */

/** The reminder picker's hour column. */
export const REMINDER_HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);
/** The reminder picker's minute column: quarter hours only. */
export const REMINDER_MINUTES: readonly string[] = ['00', '15', '30', '45'];

/** "HH:MM", the form `reminderTime` is stored and synced in. */
export function buildReminderTimeString(hour: number, minute: string): string {
  return `${hour.toString().padStart(2, '0')}:${minute}`;
}

/** A stored "HH:MM" reminder time as the app language writes a clock time. */
export function formatReminderTimeLabel(
  time: string | null,
  locale: string,
  notSetLabel: string
): string {
  if (!time) return notSetLabel;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);
  return new Date(0, 0, 0, hour, minute).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const LEGACY_CREOLE_PREFIX = 'Creoles and pidgins';

/**
 * An older catalog offered the ISO 639-5 collective "Creoles and pidgins" (`cpe`) as a
 * content language. It is not a language anyone reads, so Settings resets it to English.
 */
export function isLegacyCreoleContentLanguage(language: {
  code?: string | null;
  name?: string | null;
  nativeName?: string | null;
}): boolean {
  if (language.code !== 'cpe') return false;
  return Boolean(
    language.name?.startsWith(LEGACY_CREOLE_PREFIX) ||
    language.nativeName?.startsWith(LEGACY_CREOLE_PREFIX)
  );
}

/** "Name • Role" once both are saved, otherwise the not-set summary. */
export function getChapterFeedbackIdentitySummary(
  identity: { name: string; role: string } | null,
  notSetLabel: string
): string {
  return identity ? `${identity.name} • ${identity.role}` : notSetLabel;
}

export type AccessKeypadKey = string;

/** The passcode keypad: digits in reading order, then clear and delete. */
export const ACCESS_KEYPAD_ROWS: ReadonlyArray<readonly AccessKeypadKey[]> = [
  ['1', '2', '3', '4'],
  ['5', '6', '7', '8'],
  ['9', '0', 'clear', 'delete'],
];

export function isAccessKeypadCommand(key: AccessKeypadKey): key is 'clear' | 'delete' {
  return key === 'clear' || key === 'delete';
}

/**
 * The passcode after a keypad press. `appendDigit` is the shared passcode rule
 * (length cap, digits only) the feedback service owns.
 */
export function applyAccessKeypadKey(
  current: string,
  key: AccessKeypadKey,
  appendDigit: (current: string, digit: string) => string
): string {
  if (key === 'clear') return '';
  if (key === 'delete') return current.slice(0, -1);
  return appendDigit(current, key);
}
