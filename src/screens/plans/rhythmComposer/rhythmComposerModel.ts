import type { TFunction } from 'i18next';
import { RHYTHM_SLOT_META } from '../../../services/plans/rhythmSlots';
import { RHYTHM_PRESET_LIBRARY, type RhythmPreset } from '../../../services/plans/rhythmPresets';
import type { RhythmSlot } from '../../../services/plans/types';
import { RHYTHM_MUTATION_ERROR_CODES } from '../../../stores/readingPlansStore';

// The composer's decisions, free of React: which presets a filter shows, how
// each chip and pill is labelled, and what a rejected save tells the reader.

export type SlotFilter = 'all' | 'anytime' | RhythmSlot;

/** The tradition filter's "no filter" value; never a preset's own tradition. */
export const ALL_TRADITIONS = 'All traditions';

/** The time-of-day chips, in the order they are offered. */
export const SLOT_FILTER_CHIPS: ReadonlyArray<{ filter: SlotFilter; labelKey: string }> = [
  { filter: 'all', labelKey: 'plans.rhythmComposer.filterAll' },
  { filter: 'morning', labelKey: RHYTHM_SLOT_META.morning.shortLabelKey },
  { filter: 'afternoon', labelKey: 'plans.rhythmComposer.midday' },
  { filter: 'evening', labelKey: RHYTHM_SLOT_META.evening.shortLabelKey },
  { filter: 'anytime', labelKey: 'plans.rhythmComposer.anyTime' },
];

export function filterRhythmPresets(
  presets: readonly RhythmPreset[],
  slotFilter: SlotFilter,
  traditionFilter: string
): RhythmPreset[] {
  return presets.filter((preset) => {
    const matchesSlot =
      slotFilter === 'all'
        ? true
        : slotFilter === 'anytime'
          ? preset.slot === null
          : preset.slot === slotFilter;
    const matchesTradition =
      traditionFilter === ALL_TRADITIONS ? true : preset.tradition === traditionFilter;

    return matchesSlot && matchesTradition;
  });
}

/**
 * A tradition is translated through the first preset that belongs to it; the
 * English tradition name stays the filter value.
 */
export function getTraditionLabelKey(tradition: string): string {
  const preset = RHYTHM_PRESET_LIBRARY.find((candidate) => candidate.tradition === tradition)!;
  return `interface.rhythmPresets.${preset.id}.tradition`;
}

export function getRhythmSlotLabel(slot: RhythmSlot | null, t: TFunction): string {
  if (!slot) {
    return t('plans.rhythmComposer.anyTime');
  }

  return t(RHYTHM_SLOT_META[slot].shortLabelKey);
}

/** The "Includes" line of a preset card: its items, dot-separated. */
export function buildPresetItemPreview(preset: RhythmPreset): string {
  return preset.items.map((item) => ('title' in item ? item.title : item.planId)).join('  •  ');
}

/** Maps a stable rhythm-mutation error code (H9) to a translated message. */
export function resolveRhythmErrorMessage(code: string | undefined, t: TFunction): string {
  switch (code) {
    case RHYTHM_MUTATION_ERROR_CODES.emptyItems:
      return t('plans.rhythmComposer.errorEmptyItems');
    case RHYTHM_MUTATION_ERROR_CODES.planInAnotherRhythm:
      return t('plans.rhythmComposer.errorPlanInAnotherRhythm');
    case RHYTHM_MUTATION_ERROR_CODES.notFound:
      return t('plans.rhythmComposer.errorRhythmNotFound');
    default:
      return t('common.unexpectedError', { defaultValue: 'Something went wrong' });
  }
}
