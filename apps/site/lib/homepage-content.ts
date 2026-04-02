import type {
  HomepageActionLink,
  HomepageContentOverridePayload,
  HomepageFeatureCardOverride,
  HomepageHeroContentOverride,
  HomepageStoreLink,
  HomepageVerseOfDayOverride,
} from '@everybible/types';

import {
  defaultHomepageContent,
  type FeatureCard,
  type HeroContent,
  type HomepageContent,
  type VerseOfDayContent,
} from './site-content';
import { createSiteServiceClient } from './supabase/service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeActionLink(value: unknown): HomepageActionLink | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value.label);
  const href = readString(value.href);

  if (!label || !href) {
    return null;
  }

  return { label, href };
}

function normalizeStoreLink(value: unknown): HomepageStoreLink | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = normalizeActionLink(value);
  const eyebrow = readString(value.eyebrow);
  const platform = value.platform;

  if (!action || !eyebrow || (platform !== 'google-play' && platform !== 'app-store')) {
    return null;
  }

  return {
    ...action,
    eyebrow,
    platform,
  };
}

function normalizeHeroContent(value: unknown): HomepageHeroContentOverride | null {
  if (!isRecord(value) || !isRecord(value.visual)) {
    return null;
  }

  const title = readString(value.title);
  const description = readString(value.description);
  const visualSrc = readString(value.visual.src);
  const visualAlt = readString(value.visual.alt);
  const inlineLink = normalizeActionLink(value.inlineLink);
  const storeLinks = Array.isArray(value.storeLinks)
    ? value.storeLinks
        .map((link) => normalizeStoreLink(link))
        .filter((link): link is HomepageStoreLink => link !== null)
    : [];

  if (!title || !description || !visualSrc || !visualAlt || !inlineLink || storeLinks.length === 0) {
    return null;
  }

  return {
    title,
    description,
    visual: {
      src: visualSrc,
      alt: visualAlt,
    },
    storeLinks,
    inlineLink,
  };
}

function normalizeFeatureCard(value: unknown): HomepageFeatureCardOverride | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = readString(value.title);
  const description = readString(value.description);
  const href = readString(value.href);
  const actionLabel = readString(value.actionLabel);
  const iconSrc = readString(value.iconSrc);
  const iconAlt = readString(value.iconAlt);

  if (!title || !description || !href || !actionLabel || !iconSrc || !iconAlt) {
    return null;
  }

  return {
    title,
    description,
    href,
    actionLabel,
    iconSrc,
    iconAlt,
  };
}

function normalizeFeatureCards(value: unknown): HomepageFeatureCardOverride[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards = value
    .map((card) => normalizeFeatureCard(card))
    .filter((card): card is HomepageFeatureCardOverride => card !== null);

  return cards.length > 0 ? cards : null;
}

function normalizeVerseOfDay(value: unknown): HomepageVerseOfDayOverride | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value.label);
  const verse = readString(value.verse);
  const reference = readString(value.reference);
  const imageSrc = readString(value.imageSrc);
  const imageAlt = readString(value.imageAlt);
  const primaryAction = normalizeActionLink(value.primaryAction);
  const secondaryAction = normalizeActionLink(value.secondaryAction);

  if (
    !label ||
    !verse ||
    !reference ||
    !imageSrc ||
    !imageAlt ||
    !primaryAction ||
    !secondaryAction
  ) {
    return null;
  }

  return {
    label,
    verse,
    reference,
    imageSrc,
    imageAlt,
    primaryAction,
    secondaryAction,
  };
}

function normalizeHomepageOverride(
  payload: unknown
): Partial<HomepageContentOverridePayload> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const hero = normalizeHeroContent(payload.hero);
  const featureCards = normalizeFeatureCards(payload.featureCards);
  const verseOfDay = normalizeVerseOfDay(payload.verseOfDay);

  if (!hero && !featureCards && !verseOfDay) {
    return null;
  }

  return {
    ...(hero ? { hero } : {}),
    ...(featureCards ? { featureCards } : {}),
    ...(verseOfDay ? { verseOfDay } : {}),
  };
}

export function resolveHomepageContent(
  payload: unknown,
  fallback: HomepageContent = defaultHomepageContent
): HomepageContent {
  const override = normalizeHomepageOverride(payload);

  return {
    heroContent: (override?.hero as HeroContent | undefined) ?? fallback.heroContent,
    featureCards: (override?.featureCards as FeatureCard[] | undefined) ?? fallback.featureCards,
    verseOfDay: (override?.verseOfDay as VerseOfDayContent | undefined) ?? fallback.verseOfDay,
  };
}

async function loadLiveHomepageOverride(): Promise<unknown> {
  const service = createSiteServiceClient();
  const { data, error } = await service.rpc('get_live_homepage_content');

  if (error) {
    throw new Error(`Unable to load homepage content: ${error.message}`);
  }

  return data ?? null;
}

export async function getHomepageContent(options?: {
  loadLiveOverride?: () => Promise<unknown>;
}): Promise<HomepageContent> {
  const loadLiveOverride = options?.loadLiveOverride ?? loadLiveHomepageOverride;

  try {
    const liveOverride = await loadLiveOverride();
    return resolveHomepageContent(liveOverride);
  } catch {
    return defaultHomepageContent;
  }
}
