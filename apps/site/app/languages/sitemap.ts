import type { MetadataRoute } from 'next';

import { buildLanguageSitemap, languageSitemapIds } from '../../lib/language-page-seo';
import { getLanguageIndex, getLanguagePagesMeta } from '../../lib/language-pages-data';

/** /languages/sitemap/<id>.xml, split so no file exceeds 50,000 URLs. */
export async function generateSitemaps() {
  return languageSitemapIds((await getLanguagePagesMeta()).languageCount);
}

export default async function sitemap({
  id,
}: {
  id: number | Promise<number | string>;
}): Promise<MetadataRoute.Sitemap> {
  const [meta, index] = await Promise.all([getLanguagePagesMeta(), getLanguageIndex()]);
  // Language facts change with the atlas snapshot, not with each deploy.
  return buildLanguageSitemap(index, Number(await id), new Date(meta.generatedAt));
}
