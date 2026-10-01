import { PublicLanguageAtlas } from './atlas/PublicLanguageAtlas';
import { HomeBelowAtlas } from './HomeBelowAtlas';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import type { HomeCopy } from '../lib/home-copy';
import { homePathFor, type HomeLocaleCodeOrEn } from '../lib/home-locale-meta';
import { buildHomeStructuredData, serializeJsonLd } from '../lib/site-metadata';
import '../app/atlas.css';

/* The 1.6 MB atlas snapshot is deliberately not preloaded from the HTML: it
   competed with the fonts and scripts the headline needs, and Chrome delivers
   a preload's body on the main thread (a 30+ ms task while the page
   hydrates). PublicLanguageAtlas fetches it once the page has loaded. */
export function HomePage({ copy, localeCode }: { copy: HomeCopy; localeCode: HomeLocaleCodeOrEn }) {
  const english = localeCode === 'en';
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeStructuredData()) }}
      />
      <SiteHeader
        overlay
        mainId="top"
        nav={copy.nav}
        homeHref={homePathFor(localeCode)}
        lang={english ? undefined : copy.locale}
        dir={english ? undefined : copy.dir}
      />
      <main id="top" lang={copy.locale} dir={copy.dir}>
        <PublicLanguageAtlas copy={copy} />
        <HomeBelowAtlas copy={copy} localeCode={localeCode} />
      </main>
      <SiteFooter
        localeCode={localeCode}
        languageLabel={copy.footer.languageLabel}
        languageLocale={copy.locale}
        languageDir={copy.dir}
      />
    </>
  );
}
