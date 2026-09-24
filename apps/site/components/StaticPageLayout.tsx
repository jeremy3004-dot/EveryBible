import Link from 'next/link';
import type { ReactNode } from 'react';

import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

interface StaticPageLayoutProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}

export function StaticPageLayout({ eyebrow, title, intro, children }: StaticPageLayoutProps) {
  return (
    <>
      <SiteHeader />
      <main className="static-page" id="main">
        <div className="container static-page__container">
          {/* No prefetch: prefetching the homepage route also triggers its
              1.9 MB atlas snapshot preload and the map bundle on every
              static page visit, which costs real data on slow networks. */}
          <Link href="/" className="static-page__backlink" prefetch={false}>
            Back to homepage
          </Link>

          <section className="static-page__hero">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
          </section>

          <article className="static-page__content">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
