import type { BibleTranslation } from '../../../types';
import type {
  TranslationLanguageSearchResult,
  TranslationPickerSections,
} from '../bibleTranslationModel';

// Rows inside a section are drawn as one grouped list (shared border, hairline
// dividers, radius only on the outer corners), so each row needs to know where
// it sits in its group.
export type GroupPosition = 'only' | 'first' | 'middle' | 'last';

export const groupPosition = (index: number, count: number): GroupPosition =>
  count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

export type TranslationPickerRow =
  | { type: 'language-search-result'; id: string; language: TranslationLanguageSearchResult }
  | { type: 'preference'; id: string }
  | { type: 'section-header'; id: string; label: string }
  | {
      type: 'translation';
      id: string;
      translation: BibleTranslation;
      position: GroupPosition;
    };

export interface TranslationPickerRowsInput {
  hasActiveSearchQuery: boolean;
  languageSearchResults: TranslationLanguageSearchResult[];
  /** How many languages the language list would offer; the pill shows only when there is a choice. */
  languageOptionCount: number;
  sections: TranslationPickerSections<BibleTranslation>;
  /** Display label of the reader's language, or null when the available heading names none. */
  availableLanguageLabel: string | null;
  labels: { myTranslations: string; available: string };
}

/** The flat row list the picker's FlashList draws, headings included. */
export function buildTranslationPickerRows({
  hasActiveSearchQuery,
  languageSearchResults,
  languageOptionCount,
  sections,
  availableLanguageLabel,
  labels,
}: TranslationPickerRowsInput): TranslationPickerRow[] {
  const rows: TranslationPickerRow[] = [];

  if (hasActiveSearchQuery) {
    languageSearchResults.forEach((language) => {
      rows.push({
        type: 'language-search-result',
        id: `search-language-${language.value}`,
        language,
      });
    });
  } else if (languageOptionCount > 1) {
    rows.push({ type: 'preference', id: 'preference' });
  }

  // Fixed order, always: the Bibles the reader already has (the one they are
  // reading first), then more Bibles in their chosen language. A stable order
  // is what makes the sheet learnable — the reader knows where to look.
  if (sections.myTranslations.length > 0) {
    rows.push({
      type: 'section-header',
      id: 'section-my-translations',
      label: labels.myTranslations,
    });

    sections.myTranslations.forEach((translation, index) => {
      rows.push({
        type: 'translation',
        id: `my-${translation.id}`,
        translation,
        position: groupPosition(index, sections.myTranslations.length),
      });
    });
  }

  if (sections.availableTranslations.length > 0) {
    const languageLabel = hasActiveSearchQuery ? null : availableLanguageLabel;

    rows.push({
      type: 'section-header',
      id: 'section-available-translations',
      label: languageLabel ? `${labels.available} · ${languageLabel}` : labels.available,
    });

    sections.availableTranslations.forEach((translation, index) => {
      rows.push({
        type: 'translation',
        id: `available-${translation.id}`,
        translation,
        position: groupPosition(index, sections.availableTranslations.length),
      });
    });
  }

  return rows;
}

// Module-level so the list keeps one identity for them across renders.
export const translationPickerRowKey = (row: TranslationPickerRow) => row.id;
export const translationPickerRowType = (row: TranslationPickerRow) => row.type;
