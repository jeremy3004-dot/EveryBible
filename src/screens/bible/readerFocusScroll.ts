/** Retain a reference-search target until native paragraph measurements arrive. */
export function createReaderFocusScroll() {
  let pendingVerse: number | null = null;
  return {
    get pendingVerse() {
      return pendingVerse;
    },
    request(verse: number | null) {
      pendingVerse = verse;
    },
    flush(getOffset: (verse: number) => number | null, scroll: (offset: number) => void): boolean {
      if (pendingVerse === null) return false;
      const offset = getOffset(pendingVerse);
      if (offset === null) return false;
      pendingVerse = null;
      scroll(offset);
      return true;
    },
  };
}
