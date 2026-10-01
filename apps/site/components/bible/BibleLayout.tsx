import type { ReactNode } from 'react';

import type { BreadcrumbEntry } from '../../lib/bible-pages';
import {
  BIBLE_PUBLIC_DOMAIN_DATE,
  BIBLE_TRANSLATION_ABBREVIATION,
  BIBLE_TRANSLATION_NAME,
  BIBLE_TRANSLATION_URL,
} from '../../lib/bible-pages';
import { EVERYBIBLE_SMART_DOWNLOAD_PATH } from '../../lib/site-links';
import { StoreBadges } from '../languages/LanguageLayout';
import { SiteFooter } from '../SiteFooter';
import { SiteHeader } from '../SiteHeader';

/** Server-rendered chrome for /bible pages: header, breadcrumb, hero and footer. */
export function BibleLayout({
  trail,
  eyebrow,
  title,
  intro,
  children,
}: {
  /** Home › Bible › …; the last entry is the current page. */
  trail: readonly BreadcrumbEntry[];
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="static-page bible-page" id="main">
        <div className="container static-page__container">
          <nav aria-label="Breadcrumb" className="bible-breadcrumb">
            <ol>
              {trail.map((entry, index) => (
                <li key={entry.path}>
                  {index === trail.length - 1 ? (
                    <span aria-current="page">{entry.name}</span>
                  ) : (
                    <a href={entry.path}>{entry.name}</a>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <header className="static-page__hero bible-hero">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {intro && <p>{intro}</p>}
          </header>

          <div className="static-page__content bible-content">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** The invitation into the app; `id="app"` so the hero can link down to it. */
export function BibleAppSection({ subject }: { subject: string }) {
  return (
    <section className="bible-app" id="app" aria-labelledby="app-heading">
      <h2 id="app-heading">Read and listen in the EveryBible app</h2>
      <p>
        EveryBible is free on iPhone and Android. Read {subject} offline, listen to it read aloud,
        highlight verses and follow a reading plan.
      </p>
      <StoreBadges />
      <p>
        <a href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>Get the app for this phone</a>
      </p>
    </section>
  );
}

/** berean.bible asks for no licence or credit line; the text is public domain. */
export function BibleAttribution() {
  return (
    <p className="bible-attribution">
      Scripture from the{' '}
      <a href={BIBLE_TRANSLATION_URL} target="_blank" rel="noreferrer">
        {BIBLE_TRANSLATION_NAME} ({BIBLE_TRANSLATION_ABBREVIATION})
      </a>
      , placed in the public domain on {BIBLE_PUBLIC_DOMAIN_DATE}.
    </p>
  );
}
