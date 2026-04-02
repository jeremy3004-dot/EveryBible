export interface OpenBibleArtifact {
  id: string;
  bookCode: string | null;
  fileName: string;
  sequence: number | null;
}

export interface OpenBibleArtifactManifest {
  apiBaseUrl: string;
  artifacts: OpenBibleArtifact[];
}

const ARTIFACTS_MARKER = String.raw`\"artifacts\":`;
const API_BASE_URL_MARKER = String.raw`],\"apiBaseUrl\":\"`;

export function parseOpenBibleArtifactManifest(html: string): OpenBibleArtifactManifest {
  const artifactsStart = html.indexOf(ARTIFACTS_MARKER);
  if (artifactsStart < 0) {
    throw new Error('Open.Bible artifact manifest not found in page HTML.');
  }

  const payloadStart = artifactsStart + ARTIFACTS_MARKER.length;
  const apiBaseUrlStart = html.indexOf(API_BASE_URL_MARKER, payloadStart);
  if (apiBaseUrlStart < 0) {
    throw new Error('Open.Bible API base URL not found in page HTML.');
  }

  const artifactsPayload = html
    .slice(payloadStart, apiBaseUrlStart + 1)
    .replaceAll(String.raw`\"`, '"');
  const apiBaseUrlEnd = html.indexOf(String.raw`\"`, apiBaseUrlStart + API_BASE_URL_MARKER.length);
  if (apiBaseUrlEnd < 0) {
    throw new Error('Open.Bible API base URL was truncated.');
  }

  const apiBaseUrl = html
    .slice(apiBaseUrlStart + API_BASE_URL_MARKER.length, apiBaseUrlEnd)
    .replaceAll(String.raw`\/`, '/')
    .replaceAll(String.raw`\"`, '"');

  const artifacts = JSON.parse(artifactsPayload) as OpenBibleArtifact[];

  return {
    apiBaseUrl,
    artifacts,
  };
}

function parseTimingClockToSeconds(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{1,8})$/);
  if (!match) {
    throw new Error(`Unsupported Open.Bible timing value: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fractional = Number(`0.${match[4].padEnd(8, '0')}`);

  return hours * 3600 + minutes * 60 + seconds + fractional;
}

export function parseOpenBibleTimingText(raw: string): Record<number, number> {
  const timestamps: Record<number, number> = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*Verse\s+(\d+)\t(\d{2}:\d{2}:\d{2},\d{1,8})/);
    if (!match) {
      continue;
    }

    const verseNumber = Number(match[1]);
    const seconds = parseTimingClockToSeconds(match[2]);
    timestamps[verseNumber] = Number(seconds.toFixed(6));
  }

  return timestamps;
}

export function normalizeOpenBibleAudioEntryName(
  fileName: string
): { bookId: string; chapter: number } | null {
  const match = fileName.match(/^([1-3]?[A-Z]{2,3})_(\d{3})\.mp3$/i);
  if (!match) {
    return null;
  }

  return {
    bookId: match[1].toUpperCase(),
    chapter: Number(match[2]),
  };
}

export function normalizeOpenBibleTimingEntryName(
  fileName: string
): { bookId: string; chapter: number } | null {
  const match = fileName.match(/^([1-3]?[A-Z]{2,3})_(\d{3})\.txt$/i);
  if (!match) {
    return null;
  }

  return {
    bookId: match[1].toUpperCase(),
    chapter: Number(match[2]),
  };
}
