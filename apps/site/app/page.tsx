import { preload } from 'react-dom';
import atlasVersionData from '../lib/public-atlas-version.json';
import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { HomeBelowAtlas } from '../components/HomeBelowAtlas';
import 'maplibre-gl/dist/maplibre-gl.css';
import './atlas.css';

export default function Home() {
  preload(`/api/language-atlas/startup/${atlasVersionData.version}`, {
    as: 'fetch',
    crossOrigin: 'anonymous',
  });
  return (
    <>
      <SiteHeader overlay />
      <main id="top">
        <PublicLanguageAtlas />
        <HomeBelowAtlas />
      </main>
      <SiteFooter />
    </>
  );
}
