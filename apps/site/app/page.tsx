import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { HomeBelowAtlas } from '../components/HomeBelowAtlas';
import { buildHomeStructuredData, serializeJsonLd } from '../lib/site-metadata';
import './atlas.css';

/* The 1.6 MB atlas snapshot is deliberately not preloaded from the HTML: it
   competed with the fonts and scripts the headline needs, and Chrome delivers
   a preload's body on the main thread (a 30+ ms task while the page
   hydrates). PublicLanguageAtlas fetches it once the page has loaded. */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeStructuredData()) }}
      />
      <SiteHeader overlay mainId="top" />
      <main id="top">
        <PublicLanguageAtlas />
        <HomeBelowAtlas />
      </main>
      <SiteFooter />
    </>
  );
}
