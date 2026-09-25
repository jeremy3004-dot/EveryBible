/**
 * Withdrawn for now (2026-09-25): King James and Bible in Basic English were listed with no
 * text on the phone, which confused readers choosing between the English Bibles that do work.
 * They are kept out of every picker and catalog, and dropped from what a phone has saved.
 */
export const WITHDRAWN_TRANSLATION_IDS: ReadonlySet<string> = new Set([
  'kjv',
  'eng-kjv',
  'eng-kjv2006',
  'bbe',
  'engbbe',
]);

export function isWithdrawnTranslationId(translationId: string): boolean {
  return WITHDRAWN_TRANSLATION_IDS.has(translationId.trim().toLowerCase());
}

const HIDDEN_TRANSLATION_IDS = new Set([
  ...WITHDRAWN_TRANSLATION_IDS,
  'darby',
  'eng-kjv2006',
  'engdby',
  'engdra',
  'enggnv',
  'eng-web',
  'eng-webbe',
  'engwebp',
  'engwebpb',
  'engwebu',
  'engasvbt',
  'engfbv',
  'engkjvcpb',
  'engmsb',
  'engwebster',
  'engwmbb',
  'engwyc2017',
  'engwyc2018',
  'web',
  // Audio-only Berean variant — same "BSB" abbreviation as the bundled BSB text
  // translation; hiding prevents confusion in the picker since users looking for
  // BSB text would otherwise see two "BSB" entries, one of which has no text.
  'engberean',
]);

export function isHiddenTranslationId(translationId: string): boolean {
  return HIDDEN_TRANSLATION_IDS.has(translationId.trim().toLowerCase());
}
