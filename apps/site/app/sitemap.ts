import type { MetadataRoute } from 'next';

import { buildSitemap } from '../lib/site-metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(new Date());
}
