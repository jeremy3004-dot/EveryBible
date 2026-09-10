import { AccessibilityInfo } from 'react-native';

/**
 * Speak a short status update through the active screen reader.
 *
 * Screen-reader users get no signal from silent UI transitions (a chapter
 * swipe, a download finishing, a submitted form), so those flows announce the
 * status text that sighted users can already see. Failures are swallowed: an
 * announcement is a courtesy, never a reason to break the interaction.
 */
export function announceForAccessibility(message: string): void {
  if (!message || !message.trim()) return;

  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // Platforms without an accessibility bridge (or web) simply skip the announcement.
  }
}
