export interface HomeVerseShareMessageInput {
  cardTitle: string;
  referenceLabel: string;
  bodyText: string;
}

const normalizeShareLine = (value: string): string => value.trim();

export function buildHomeVerseShareMessage({
  cardTitle,
  referenceLabel,
  bodyText,
}: HomeVerseShareMessageInput): string {
  const lines = [cardTitle, referenceLabel].map(normalizeShareLine).filter((line) => line.length > 0);
  const normalizedBodyText = bodyText.trim();

  return normalizedBodyText.length > 0
    ? `${lines.join('\n')}\n\n${normalizedBodyText}`
    : lines.join('\n');
}
