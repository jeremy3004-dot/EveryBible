const CLOUD_TEXT_TRANSLATION_ID_ALIASES: Record<string, string> = {
  asv: 'eng-asv',
  bsb: 'engbsb',
  rvr: 'spaRV1909',
  sparv1909: 'spaRV1909',
  web: 'engwebp',
  ylt: 'engylt',
};

export function resolveCloudTextTranslationId(
  requestedTranslationId: string,
  catalogTranslationId: string
): string {
  const normalizedRequestedId = requestedTranslationId.trim().toLowerCase();
  return CLOUD_TEXT_TRANSLATION_ID_ALIASES[normalizedRequestedId] ?? catalogTranslationId;
}
