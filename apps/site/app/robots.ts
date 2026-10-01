import type { MetadataRoute } from 'next';

import { languageSitemapUrls } from '../lib/language-page-seo';
import { getLanguagePagesMeta } from '../lib/language-pages-data';
import { buildRobots, SECTION_SITEMAP_URLS } from '../lib/site-metadata';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { sitemapCount } = await getLanguagePagesMeta();
  return buildRobots([...SECTION_SITEMAP_URLS, ...languageSitemapUrls(sitemapCount)]);
}
