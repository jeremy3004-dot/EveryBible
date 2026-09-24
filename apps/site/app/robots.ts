import type { MetadataRoute } from 'next';

import { languageSitemapUrls } from '../lib/language-page-seo';
import { getLanguagePagesMeta } from '../lib/language-pages-data';
import { buildRobots } from '../lib/site-metadata';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { languageCount } = await getLanguagePagesMeta();
  return buildRobots(languageSitemapUrls(languageCount));
}
