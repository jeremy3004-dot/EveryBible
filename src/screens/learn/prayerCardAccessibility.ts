import type { TFunction } from 'i18next';

export type PrayerInteractionType = 'prayed' | 'encouraged';

interface PrayerCardAccessibilityInput {
  displayName: string;
  relativeTime: string;
  isAnswered: boolean;
  isUnderReview?: boolean;
  content: string;
  prayedCount: number;
  encouragedCount: number;
  hasPrayed: boolean;
  hasEncouraged: boolean;
}

/**
 * What the prayer card says as its one VoiceOver element. The Prayed / Encouraged
 * pills inside it are unreachable on iOS, so the card carries everything they show,
 * including whether the viewer has already prayed or encouraged: the pills mark that
 * only by fill and icon, and without it a second tap (which withdraws) sounded the
 * same as the first.
 */
export function buildPrayerCardAccessibilityLabel(
  t: TFunction,
  input: PrayerCardAccessibilityInput
): string {
  return [
    input.displayName,
    input.relativeTime,
    input.isAnswered ? t('prayer.answered') : null,
    input.isUnderReview ? t('prayer.underReview') : null,
    input.content,
    t('prayer.prayedCount', { count: input.prayedCount }),
    input.hasPrayed ? t('interface.prayerYouPrayed') : null,
    t('prayer.encouragedCount', { count: input.encouragedCount }),
    input.hasEncouraged ? t('interface.prayerYouEncouraged') : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Spoken after a Prayed / Encouraged toggle lands, so the change is heard, not only seen. */
export function prayerInteractionAnnouncement(
  t: TFunction,
  type: PrayerInteractionType,
  isNowActive: boolean
): string {
  if (type === 'prayed') {
    return isNowActive ? t('interface.prayerYouPrayed') : t('interface.prayerPrayedRemoved');
  }
  return isNowActive ? t('interface.prayerYouEncouraged') : t('interface.prayerEncouragedRemoved');
}

/**
 * Spoken after mark-answered or delete succeeds. The card changes or disappears and focus
 * moves with it, so without this the action finished in silence.
 */
export function prayerRequestActionAnnouncement(
  t: TFunction,
  action: 'markAnswered' | 'delete'
): string {
  return action === 'markAnswered'
    ? t('interface.prayerMarkedAnswered')
    : t('interface.prayerRequestRemoved');
}
