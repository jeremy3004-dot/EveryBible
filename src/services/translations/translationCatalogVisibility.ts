const HIDDEN_TRANSLATION_IDS = new Set([
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
