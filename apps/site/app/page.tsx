import { PublicLanguageAtlas } from '../components/atlas/PublicLanguageAtlas';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import 'maplibre-gl/dist/maplibre-gl.css';
import './atlas.css';

export default function Home() {
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
