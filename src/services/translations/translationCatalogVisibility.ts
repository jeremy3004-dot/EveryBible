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
]);

export function isHiddenTranslationId(translationId: string): boolean {
  return HIDDEN_TRANSLATION_IDS.has(translationId.trim().toLowerCase());
}
