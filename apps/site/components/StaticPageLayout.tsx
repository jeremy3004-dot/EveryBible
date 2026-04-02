import Link from 'next/link';
import type { ReactNode } from 'react';

interface StaticPageLayoutProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}

export function StaticPageLayout({
  eyebrow,
  title,
  intro,
  children,
}: StaticPageLayoutProps) {
  return (
    <main className="static-page">
      <div className="container static-page__container">
        <Link href="/" className="static-page__backlink">
          Back to EveryBible
        </Link>

        <section className="static-page__hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </section>

        <article className="static-page__content">{children}</article>
      </div>
    </main>
  );
}
