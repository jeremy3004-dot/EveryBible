import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

export interface MobileContentImageOverride {
  altText: string;
  endsAt: string | null;
  id: string;
  imageUrl: string;
  kind: 'hero' | 'verse_of_day' | 'promo' | 'feature' | 'social';
  startsAt: string | null;
  title: string;
}

export interface MobileVerseOfDayOverride {
  endsAt: string | null;
  id: string;
  imageUrl: string | null;
  referenceLabel: string;
  startsAt: string | null;
  title: string | null;
  translationId: string;
  verseText: string;
}

export interface MobileContentOverridePayload {
  generatedAt: string;
  images: MobileContentImageOverride[];
  verseOfDay: MobileVerseOfDayOverride | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getMobileContentEndpoint(): string | null {
  return publicRuntimeConfig.EXPO_PUBLIC_CONTENT_API_URL ?? null;
}

export function parseMobileContentOverridePayload(
  value: unknown
): MobileContentOverridePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const generatedAt = asString(value.generatedAt);
  const rawImages = Array.isArray(value.images) ? value.images : [];
  const images = rawImages
    .map((image) => {
      if (!isRecord(image)) {
        return null;
      }

      const id = asString(image.id);
      const title = asString(image.title);
      const kind = asString(image.kind);
      const imageUrl = asString(image.imageUrl);
      const altText = asString(image.altText);

      if (!id || !title || !kind || !imageUrl || !altText) {
        return null;
      }

      return {
        altText,
        endsAt: asString(image.endsAt),
        id,
        imageUrl,
        kind: kind as MobileContentImageOverride['kind'],
        startsAt: asString(image.startsAt),
        title,
      };
    })
    .filter((image): image is MobileContentImageOverride => image !== null);

  const verseOfDay = isRecord(value.verseOfDay)
    ? (() => {
        const verseText = asString(value.verseOfDay.verseText);
        const referenceLabel = asString(value.verseOfDay.referenceLabel);
        const translationId = asString(value.verseOfDay.translationId);
        const id = asString(value.verseOfDay.id);

        if (!verseText || !referenceLabel || !translationId || !id) {
          return null;
        }

        return {
          endsAt: asString(value.verseOfDay.endsAt),
          id,
          imageUrl: asString(value.verseOfDay.imageUrl),
          referenceLabel,
          startsAt: asString(value.verseOfDay.startsAt),
          title: asString(value.verseOfDay.title),
          translationId,
          verseText,
        };
      })()
    : null;

  if (!generatedAt) {
    return null;
  }

  return {
    generatedAt,
    images,
    verseOfDay,
  };
}

export async function getMobileContentOverrides(
  fetchImpl: typeof fetch = fetch
): Promise<MobileContentOverridePayload | null> {
  const endpoint = getMobileContentEndpoint();

  if (!endpoint) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return parseMobileContentOverridePayload(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLiveVerseOfDayOverride(
  fetchImpl: typeof fetch = fetch
): Promise<MobileVerseOfDayOverride | null> {
  const payload = await getMobileContentOverrides(fetchImpl);
  return payload?.verseOfDay ?? null;
}
