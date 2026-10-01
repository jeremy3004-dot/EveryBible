import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { HomeBelowAtlas } from '../components/HomeBelowAtlas';
import { storyStats } from '../lib/atlas-story';
import { getLanguagePagesMeta } from '../lib/language-pages-data';
import { projectSnapshot } from '../lib/public-atlas-projects';
import { buildHomeStructuredData, serializeJsonLd } from '../lib/site-metadata';
import './atlas.css';

/* Re-rendered daily so the reading plans shelf follows the church year
   (Advent, Christmas) without a deploy. */
export const revalidate = 86400;

/* The 1.6 MB atlas snapshot is deliberately not preloaded from the HTML: it
   competed with the fonts and scripts the headline needs, and Chrome delivers
   a preload's body on the main thread (a 30+ ms task while the page
   hydrates). PublicLanguageAtlas fetches it once the page has loaded. */
export default async function Home() {
  const stats = storyStats(await getLanguagePagesMeta(), projectSnapshot.projects.length);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeStructuredData()) }}
      />
      <SiteHeader overlay mainId="top" />
      <main id="top">
        <PublicLanguageAtlas stats={stats} />
        <HomeBelowAtlas />
      </main>
      <SiteFooter />
    </>
  );
}
