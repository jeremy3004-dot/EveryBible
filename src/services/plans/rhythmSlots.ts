import type { RhythmSlot } from './types';

export const RHYTHM_SLOT_ORDER: RhythmSlot[] = ['morning', 'afternoon', 'evening'];

export const RHYTHM_SLOT_META: Record<
  RhythmSlot,
  {
    defaultTitle: string;
    iconName: 'sunny-outline' | 'partly-sunny-outline' | 'moon-outline';
    labelKey: 'readingPlans.morningRhythm' | 'readingPlans.afternoonRhythm' | 'readingPlans.eveningRhythm';
    shortLabelKey:
      | 'readingPlans.morningLabel'
      | 'readingPlans.afternoonLabel'
      | 'readingPlans.eveningLabel';
  }
> = {
  morning: {
    defaultTitle: 'Morning Rhythm',
    iconName: 'sunny-outline',
    labelKey: 'readingPlans.morningRhythm',
    shortLabelKey: 'readingPlans.morningLabel',
  },
  afternoon: {
    defaultTitle: 'Afternoon Rhythm',
    iconName: 'partly-sunny-outline',
    labelKey: 'readingPlans.afternoonRhythm',
    shortLabelKey: 'readingPlans.afternoonLabel',
  },
  evening: {
    defaultTitle: 'Evening Rhythm',
    iconName: 'moon-outline',
    labelKey: 'readingPlans.eveningRhythm',
    shortLabelKey: 'readingPlans.eveningLabel',
  },
};

export const getRhythmSlotDefaultTitle = (slot: RhythmSlot): string => RHYTHM_SLOT_META[slot].defaultTitle;

export const normalizeRhythmSlot = (slot: string | null | undefined): RhythmSlot | undefined => {
  if (!slot) {
    return undefined;
  }

  return slot in RHYTHM_SLOT_META ? (slot as RhythmSlot) : undefined;
};

export const inferRhythmSlotFromTitle = (title: string | null | undefined): RhythmSlot | undefined => {
  const normalizedTitle = title?.trim().toLowerCase();
  if (!normalizedTitle) {
    return undefined;
  }

  return RHYTHM_SLOT_ORDER.find((slot) =>
    normalizedTitle.includes(getRhythmSlotDefaultTitle(slot).toLowerCase().replace(' rhythm', ''))
  );
};
