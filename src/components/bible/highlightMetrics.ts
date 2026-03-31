export function getCompactHighlightVerticalInset(
  fontSize: number | undefined,
  lineHeight: number | undefined
): number {
  const resolvedFontSize = typeof fontSize === 'number' ? fontSize : 16;
  const resolvedLineHeight =
    typeof lineHeight === 'number' ? lineHeight : Math.round(resolvedFontSize * 1.15);
  const extraLeading = Math.max(0, resolvedLineHeight - resolvedFontSize);

  return Math.max(2, Math.min(5, Math.round(extraLeading / 2)));
}
