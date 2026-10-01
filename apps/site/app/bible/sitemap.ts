import type { MetadataRoute } from 'next';

import { buildBibleSitemap } from '../../lib/bible-pages';

/** /bible/sitemap.xml: /bible, the 66 book pages and all 1,189 chapters. */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildBibleSitemap();
}
