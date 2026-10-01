import type { MetadataRoute } from 'next';

import { buildPlansSitemap } from '../../lib/plan-pages';

/** /plans/sitemap.xml: the catalog and every plan page. */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildPlansSitemap();
}
