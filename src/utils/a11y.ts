import { AccessibilityInfo, Platform } from 'react-native';

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

/**
 * Speak text that is also rendered inside an `accessibilityLiveRegion`.
 *
 * TalkBack reads a live region itself when it appears or changes, so announcing
 * the same text on Android makes it speak twice. VoiceOver ignores live regions,
 * so iOS still needs the announcement.
 */
export function announceLiveRegionText(message: string): void {
  if (Platform.OS === 'android') return;
  announceForAccessibility(message);
}
