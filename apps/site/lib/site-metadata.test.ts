import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHomeStructuredData,
  buildRobots,
  buildSitemap,
  pageMetadata,
  serializeJsonLd,
  SHARE_IMAGE,
  siteMetadata,
} from './site-metadata';
import { EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL } from './site-links';

test('root metadata resolves relative URLs against the production origin', () => {
  assert.equal(siteMetadata.metadataBase?.toString(), 'https://everybible.app/');
  assert.deepEqual(siteMetadata.alternates, { canonical: '/' });
});

test('pageMetadata gives a page its own canonical, Open Graph and Twitter card', () => {
  const metadata = pageMetadata({
    title: 'About EveryBible',
    description: 'Mission copy.',
    path: '/about',
  });

  assert.deepEqual(metadata, {
    title: 'About EveryBible',
    description: 'Mission copy.',
    alternates: { canonical: '/about' },
    openGraph: {
      type: 'website',
      siteName: 'EveryBible',
      locale: 'en_US',
      url: '/about',
      title: 'About EveryBible',
      description: 'Mission copy.',
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'About EveryBible',
      description: 'Mission copy.',
      images: [SHARE_IMAGE],
    },
  });
});

test('the sitemap lists every indexable page as an absolute URL and skips redirects', () => {
  const lastModified = new Date('2026-09-24T00:00:00Z');
  const entries = buildSitemap(lastModified);

  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      'https://everybible.app/',
      'https://everybible.app/about',
      'https://everybible.app/give',
      'https://everybible.app/languages',
      'https://everybible.app/support',
      'https://everybible.app/privacy',
      'https://everybible.app/terms',
    ]
  );
  assert.ok(entries.every((entry) => entry.lastModified === lastModified));
  assert.equal(entries[0].priority, 1);
  assert.ok(!entries.some((entry) => entry.url.includes('/download')));
});

test('robots allows the site, keeps crawlers out of the data API, and names every sitemap', () => {
  assert.deepEqual(buildRobots(), {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: ['https://everybible.app/sitemap.xml'],
  });
  assert.deepEqual(buildRobots(['https://everybible.app/languages/sitemap/0.xml']).sitemap, [
    'https://everybible.app/sitemap.xml',
    'https://everybible.app/languages/sitemap/0.xml',
  ]);
});

test('structured data describes the free app with both store listings', () => {
  const data = buildHomeStructuredData();
  const app = data['@graph'].find((node) => node['@type'] === 'MobileApplication');

  assert.ok(app && 'installUrl' in app);
  assert.deepEqual(app.installUrl, [EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL]);
  assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  assert.equal(app.operatingSystem, 'iOS, Android');
  assert.ok(!('aggregateRating' in app), 'ratings must never be invented');
});

test('serializeJsonLd cannot close the surrounding script element', () => {
  const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

  assert.ok(!json.includes('</script>'));
  assert.deepEqual(JSON.parse(json), { name: '</script><script>alert(1)</script>' });
});
