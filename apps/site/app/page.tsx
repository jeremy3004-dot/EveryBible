import { preload } from 'react-dom';
import atlasVersionData from '../lib/public-atlas-version.json';
import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { HomeBelowAtlas } from '../components/HomeBelowAtlas';
import { buildHomeStructuredData, serializeJsonLd } from '../lib/site-metadata';
import 'maplibre-gl/dist/maplibre-gl.css';
import './atlas.css';

export default function Home() {
  // Discovered from the HTML so the 1.9 MB snapshot starts early, but at low
  // priority: at high priority it shared bandwidth with the render-blocking
  // CSS, fonts and scripts and pushed back the first paint on slow networks.
  preload(`/api/language-atlas/startup/${atlasVersionData.version}`, {
    as: 'fetch',
    crossOrigin: 'anonymous',
    fetchPriority: 'low',
  });
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
