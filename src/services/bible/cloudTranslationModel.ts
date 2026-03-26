const CLOUD_TEXT_TRANSLATION_ID_ALIASES: Record<string, string> = {
  asv: 'eng-asv',
  bbe: 'engBBE',
  bsb: 'engbsb',
  rvr: 'spaRV1909',
  sparv1909: 'spaRV1909',
  web: 'engwebp',
  ylt: 'engylt',
};

type CloudFetchContinuationInput = {
  totalVerses: number;
  fetchedVerses: number;
  lastPageLength: number;
};

export function resolveCloudTextTranslationId(
  requestedTranslationId: string,
  catalogTranslationId: string
): string {
  const normalizedRequestedId = requestedTranslationId.trim().toLowerCase();
  return CLOUD_TEXT_TRANSLATION_ID_ALIASES[normalizedRequestedId] ?? catalogTranslationId;
}

export function buildUnavailableCloudTranslationMessage(translationNameOrId: string): string {
  return `${translationNameOrId} is not currently available from the backend.`;
}

export function shouldContinueCloudTranslationFetch({
  totalVerses,
  fetchedVerses,
  lastPageLength,
}: CloudFetchContinuationInput): boolean {
  if (lastPageLength <= 0 || totalVerses <= 0) {
    return false;
  }

  return fetchedVerses < totalVerses;
}

export function assertCompleteCloudTranslationFetch(
  translationNameOrId: string,
  totalVerses: number,
  fetchedVerses: number
): void {
  if (totalVerses > 0 && fetchedVerses < totalVerses) {
    throw new Error(
      `Incomplete backend download for ${translationNameOrId}: expected ${totalVerses} verses, received ${fetchedVerses}.`
    );
  }
}
