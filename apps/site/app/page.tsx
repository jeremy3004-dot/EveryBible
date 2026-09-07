import { preload } from 'react-dom';
import atlasVersionData from '../lib/public-atlas-version.json';
import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import 'maplibre-gl/dist/maplibre-gl.css';
import './atlas.css';

export default function Home() {
  preload(`/api/language-atlas/startup/${atlasVersionData.version}`, {
    as: 'fetch',
    crossOrigin: 'anonymous',
  });
  return (
    <>
      <SiteHeader />
      <main id="top">
        <PublicLanguageAtlas />
      </main>
      <SiteFooter />
    </>
  );
}
