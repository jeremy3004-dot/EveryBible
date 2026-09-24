import Image from 'next/image';
import type { ReactNode } from 'react';

import { scriptureVisualCategory } from '../../../admin/lib/language-atlas/presentation';
import type { ScriptureStatus } from '../../../admin/lib/language-atlas/types';
import { scriptureStatusLabel } from '../../lib/language-page-seo';
import { LANGUAGES_PATH } from '../../lib/language-slug';
import { EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL } from '../../lib/site-links';
import { SiteFooter } from '../SiteFooter';
import { SiteHeader } from '../SiteHeader';

/** Server-rendered chrome for /languages pages; no atlas data reaches the browser. */
export function LanguageLayout({
  current,
  eyebrow,
  title,
  intro,
  status,
  statusNote,
  children,
}: {
  /** Last breadcrumb entry; omitted on the /languages hub itself. */
  current?: string;
  eyebrow: string;
  title: string;
  intro: string;
  status?: ScriptureStatus;
  /** Shown under the badge, e.g. which member language a macrolanguage's status comes from. */
  statusNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="static-page language-page" id="main">
        <div className="container static-page__container">
          <nav aria-label="Breadcrumb" className="language-breadcrumb">
            <ol>
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                {current ? (
                  <a href={LANGUAGES_PATH}>Languages</a>
                ) : (
                  <span aria-current="page">Languages</span>
                )}
              </li>
              {current && (
                <li>
                  <span aria-current="page">{current}</span>
                </li>
              )}
            </ol>
          </nav>

          <section className="static-page__hero">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
            {status && <ScriptureStatusBadge status={status} large />}
            {statusNote && <p className="language-status-note">{statusNote}</p>}
          </section>

          <article className="static-page__content">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** The atlas's Scripture colours; the text label always carries the meaning. */
export function ScriptureStatusBadge({
  status,
  large = false,
}: {
  status: ScriptureStatus;
  large?: boolean;
}) {
  return (
    <span
      className={large ? 'language-status language-status--large' : 'language-status'}
      data-status={scriptureVisualCategory(status)}
    >
      <i aria-hidden="true" />
      {scriptureStatusLabel(status)}
    </span>
  );
}

export function StoreBadges() {
  return (
    <div className="language-stores">
      <a href={EVERYBIBLE_APP_STORE_URL}>
        <Image
          src="/everybible/badge-app-store.svg"
          alt="Download on the App Store"
          width={140}
          height={42}
          unoptimized
        />
      </a>
      <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>
        <Image
          src="/everybible/badge-google-play.png"
          alt="Get it on Google Play"
          width={141}
          height={42}
        />
      </a>
    </div>
  );
}
