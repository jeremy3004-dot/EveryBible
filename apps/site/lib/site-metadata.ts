import type { Metadata, MetadataRoute, Viewport } from 'next';

import {
  EVERY_LANGUAGE_URL,
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SITE_URL,
  EVERYBIBLE_SUPPORT_PATH,
  EVERYBIBLE_TERMS_PATH,
} from './site-links';

export const SITE_NAME = 'EveryBible';
export const SITE_TITLE = 'God’s Word. In your heart language. | EveryBible';
export const SITE_DESCRIPTION =
  'Read, listen, and grow closer to God through Scripture in your own language. Explore Every Language’s vision for the whole Bible in every language, in this generation.';

/** Share card rendered by app/opengraph-image.tsx (1200×630). */
export const SHARE_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'EveryBible — God’s Word. In your heart language.',
};

/**
 * Root metadata. `metadataBase` turns every relative canonical and share-image
 * path into an absolute https://everybible.app URL, which crawlers and link
 * unfurlers require.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL(EVERYBIBLE_SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: '/',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
};

interface PageMetadataInput {
  title: string;
  description: string;
  /** Site-relative path beginning with `/`. */
  path: `/${string}`;
}

/**
 * Per-page metadata. Next merges `openGraph` and `twitter` shallowly, so a
 * page that sets them must repeat the share image, site name, and card type or
 * they silently disappear from that page.
 */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: path,
      title,
      description,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SHARE_IMAGE],
    },
  };
}

/**
 * Indexable pages. `/download` is a device redirect and `/api` is data only.
 * Individual language pages have their own sitemaps (app/languages/sitemap.ts).
 */
export const SITEMAP_PATHS = [
  '/',
  '/about',
  '/give',
  '/languages',
  EVERYBIBLE_SUPPORT_PATH,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_TERMS_PATH,
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
] as const;

export function buildSitemap(lastModified: Date): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({
    url: new URL(path, EVERYBIBLE_SITE_URL).toString(),
    lastModified,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority:
      path === '/' ? 1 : path === '/about' || path === '/give' || path === '/languages' ? 0.8 : 0.5,
  }));
}

/** `additionalSitemaps` are absolute URLs, such as the language page sitemaps. */
export function buildRobots(additionalSitemaps: readonly string[] = []): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: [`${EVERYBIBLE_SITE_URL}/sitemap.xml`, ...additionalSitemaps],
  };
}

/**
 * schema.org JSON-LD for the homepage: the website, its publisher, and the
 * free mobile app with its two store listings. No rating is included — the
 * stores have no public aggregate yet, and invented ratings violate Google's
 * structured-data policy.
 */
export function buildHomeStructuredData() {
  const organization = {
    '@type': 'Organization',
    '@id': `${EVERY_LANGUAGE_URL}/#organization`,
    name: 'Every Language',
    url: EVERY_LANGUAGE_URL,
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': `${EVERYBIBLE_SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${EVERYBIBLE_SITE_URL}/`,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': organization['@id'] },
      },
      {
        '@type': 'MobileApplication',
        '@id': `${EVERYBIBLE_SITE_URL}/#app`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: `${EVERYBIBLE_SITE_URL}/`,
        applicationCategory: 'ReferenceApplication',
        operatingSystem: 'iOS, Android',
        image: `${EVERYBIBLE_SITE_URL}/everybible/app-icon.png`,
        installUrl: [EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL],
        sameAs: [EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': organization['@id'] },
      },
    ],
  };
}

/**
 * Serialises JSON-LD for a `<script type="application/ld+json">` body.
 * Escaping `<` keeps any string value from closing the script element early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Browser chrome matches the default FIELD dark surface. */
export const siteViewport: Viewport = {
  themeColor: 'hsl(48 14% 6%)',
  colorScheme: 'dark',
};
