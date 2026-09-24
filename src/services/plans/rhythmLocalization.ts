import type { TFunction } from 'i18next';
import { getBookById, getTranslatedBookName } from '../../constants/books';
import { RHYTHM_PRESET_LIBRARY, type RhythmPreset } from './rhythmPresets';
import { RHYTHM_SLOT_META } from './rhythmSlots';

// The store names untitled rhythms in English ("Morning Rhythm", "Rhythm 2");
// those automatic titles follow the interface language, typed titles do not.
const AUTOMATIC_NUMBERED_TITLE = /^Rhythm (\d+)$/;

export function getLocalizedRhythmTitle(title: string, t: TFunction): string {
  const preset = RHYTHM_PRESET_LIBRARY.find((candidate) => candidate.title === title);
  if (preset) return t(`interface.rhythmPresets.${preset.id}.title`);
  const slot = Object.values(RHYTHM_SLOT_META).find((meta) => meta.defaultTitle === title);
  if (slot) return t(slot.labelKey);
  const numbered = title.match(AUTOMATIC_NUMBERED_TITLE);
  return numbered ? t('readingPlans.rhythmNumber', { number: Number(numbered[1]) }) : title;
}

export function getLocalizedPassageTitle(
  title: string,
  bookId: string,
  start: number,
  end: number,
  t: TFunction
): string {
  const name = getBookById(bookId)?.name;
  const defaultTitles = [name, bookId].flatMap((book) =>
    book ? [`${book} ${start}`, `${book} ${start}-${end}`, `${book} ${start}–${end}`] : []
  );
  // Existing user titles stay intact; only built-in reference labels follow the interface language.
  if (title && !defaultTitles.includes(title) && !(bookId === 'PSA' && title === `Psalm ${start}`))
    return title;
  const reference = `${getTranslatedBookName(bookId, t)} ${start}`;
  return start === end ? reference : `${reference}–${end}`;
}

export function localizeRhythmPreset(preset: RhythmPreset, t: TFunction): RhythmPreset {
  return {
    ...preset,
    title: t(`interface.rhythmPresets.${preset.id}.title`),
    description: t(`interface.rhythmPresets.${preset.id}.description`),
    tradition: t(`interface.rhythmPresets.${preset.id}.tradition`),
    historicRoots: t(`interface.rhythmPresets.${preset.id}.historicRoots`),
    items: preset.items.map((item) =>
      item.type === 'passage'
        ? {
            ...item,
            title: getLocalizedPassageTitle(
              item.title,
              item.bookId,
              item.startChapter,
              item.endChapter ?? item.startChapter,
              t
            ),
          }
        : item
    ),
  };
}
