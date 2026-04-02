export type AdminRole = 'super_admin';

export type PublishState = 'draft' | 'scheduled' | 'live' | 'archived';

export type SyncState = 'idle' | 'running' | 'succeeded' | 'failed';

export type TranslationDistributionState = 'draft' | 'ready' | 'published' | 'hidden';

export type ContentImageKind =
  | 'hero'
  | 'verse_of_day'
  | 'promo'
  | 'feature'
  | 'social';

export type CoarseLocationGranularity = 'country' | 'region' | 'metro';

export interface ContentWindow {
  startsAt: string | null;
  endsAt: string | null;
  state: PublishState;
}

export interface SyncRunSummary {
  id: string;
  state: SyncState;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
}

export interface AdminNavigationItem {
  label: string;
  href: string;
  description: string;
}

export interface MobileContentOverridePayload {
  generatedAt: string;
  verseOfDay: {
    id: string;
    title: string | null;
    verseText: string;
    referenceLabel: string;
    translationId: string;
    imageUrl: string | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  images: Array<{
    id: string;
    title: string;
    kind: ContentImageKind;
    imageUrl: string;
    altText: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
}

export interface HomepageActionLink {
  label: string;
  href: string;
}

export interface HomepageStoreLink extends HomepageActionLink {
  eyebrow: string;
  platform: 'google-play' | 'app-store';
}

export interface HomepageHeroContentOverride {
  title: string;
  description: string;
  visual: {
    src: string;
    alt: string;
  };
  storeLinks: HomepageStoreLink[];
  inlineLink: HomepageActionLink;
}

export interface HomepageFeatureCardOverride {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  iconSrc: string;
  iconAlt: string;
}

export interface HomepageVerseOfDayOverride {
  label: string;
  verse: string;
  reference: string;
  imageSrc: string;
  imageAlt: string;
  primaryAction: HomepageActionLink;
  secondaryAction: HomepageActionLink;
}

export interface HomepageContentOverridePayload {
  hero: HomepageHeroContentOverride;
  featureCards: HomepageFeatureCardOverride[];
  verseOfDay: HomepageVerseOfDayOverride;
}

export interface OperatorAuditMetadata {
  actorSource?: string;
  channel?: string | null;
  toolName?: string | null;
  targetSlug?: string | null;
  changedFields?: string[];
  requesterSenderId?: string | null;
  requesterDisplayName?: string | null;
  requestId?: string | null;
  [key: string]: unknown;
}
