export type FontSizeSheetAction =
  | 'toggleButton'
  | 'readerContentTap'
  | 'scrollStart'
  | 'chapterChange';

export type TranslationSheetAction = 'toggleChip' | 'selectTranslation' | 'dismiss';

export const getNextFontSizeSheetVisibility = (
  isVisible: boolean,
  action: FontSizeSheetAction
): boolean => {
  if (action === 'toggleButton') {
    return !isVisible;
  }

  return false;
};

export const getNextTranslationSheetVisibility = (
  isVisible: boolean,
  canShowTranslationSheet: boolean,
  action: TranslationSheetAction
): boolean => {
  if (!canShowTranslationSheet) {
    return false;
  }

  if (action === 'toggleChip') {
    return !isVisible;
  }

  return false;
};
