/**
 * Pure model functions for the Settings screen preference display.
 * These extract testable logic from SettingsScreen.tsx without modifying
 * the screen component itself.
 */

export type PrivacyMode = 'discreet' | 'standard';

export interface PrivacyDisplayInput {
  mode: PrivacyMode;
  discreetLabel: string;
  standardLabel: string;
}

/**
 * Resolves the human-readable label for the current privacy mode,
 * reflecting the same logic used in the SettingsScreen UI.
 */
export function resolvePrivacyModeLabel({
  mode,
  discreetLabel,
  standardLabel,
}: PrivacyDisplayInput): string {
  return mode === 'discreet' ? discreetLabel : standardLabel;
}

export interface ReminderDisplayInput {
  notificationsEnabled: boolean;
  reminderTime: string | null;
  notSetLabel: string;
}

/**
 * Formats the reminder time for display. Returns the `notSetLabel` when
 * no time has been saved. Uses 12-hour AM/PM formatting.
 */
export function formatReminderTimeDisplay({
  reminderTime,
  notSetLabel,
}: Pick<ReminderDisplayInput, 'reminderTime' | 'notSetLabel'>): string {
  if (!reminderTime) return notSetLabel;

  const parts = reminderTime.split(':');
  if (parts.length !== 2) return notSetLabel;

  const hour = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hour)) return notSetLabel;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Returns whether the reminder time row should be interactive.
 */
export function isReminderTimeEditable(notificationsEnabled: boolean): boolean {
  return notificationsEnabled;
}
