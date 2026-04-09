export const GATHER_ARTWORK_ZOOM_OVERRIDES: Record<string, number> = {
  'foundation-1': 1.2,
  'topic-money-advice': 0.92,
  'topic-women': 0.92,
};

export function getGatherArtworkZoom(artworkKey?: string): number {
  if (!artworkKey) {
    return 1;
  }

  return GATHER_ARTWORK_ZOOM_OVERRIDES[artworkKey] ?? 1;
}
