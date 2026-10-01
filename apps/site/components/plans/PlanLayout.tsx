/* eslint-disable @next/next/no-img-element -- plain <img> keeps these pages free of
   next/image's client component (see lib/static-image.ts); the covers are
   already 800 px WebP, so they skip the optimizer. */
import type { ReactNode } from 'react';

import {
  PLAN_COVER_SIZE,
  PLANS_PATH,
  planCoverPath,
  planMetaLabel,
  planPath,
} from '../../lib/plan-pages';
import type { SitePlan } from '../../lib/plan-snapshot';
import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_SMART_DOWNLOAD_PATH,
} from '../../lib/site-links';
import { staticImageProps } from '../../lib/static-image';
import { SiteFooter } from '../SiteFooter';
import { SiteHeader } from '../SiteHeader';

const appStoreBadge = staticImageProps('/everybible/badge-app-store.svg', 140, 42, {
  unoptimized: true,
});
const googlePlayBadge = staticImageProps('/everybible/badge-google-play.png', 141, 42);

/** Server-rendered chrome for /plans pages; nothing here needs JavaScript. */
export function PlanLayout({
  current,
  children,
}: {
  /** Last breadcrumb entry; omitted on the /plans catalog itself. */
  current?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="static-page plans-page" id="main">
        <div className="container static-page__container">
          <nav aria-label="Breadcrumb" className="plan-breadcrumb">
            <ol>
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                {current ? (
                  <a href={PLANS_PATH}>Reading plans</a>
                ) : (
                  <span aria-current="page">Reading plans</span>
                )}
              </li>
              {current && (
                <li>
                  <span aria-current="page">{current}</span>
                </li>
              )}
            </ol>
          </nav>
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * A cover plate. The covers are abstract artwork and every one sits beside
 * its plan's title, so they are decorative (empty alt), as in the app.
 */
export function PlanCover({
  plan,
  className,
  priority = false,
}: {
  plan: Pick<SitePlan, 'cover'>;
  className: string;
  priority?: boolean;
}) {
  return (
    <img
      className={className}
      src={planCoverPath(plan)}
      width={PLAN_COVER_SIZE.width}
      height={PLAN_COVER_SIZE.height}
      alt=""
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}

/** Cover, title and length, linking to the plan's page. */
export function PlanCards({ plans }: { plans: readonly SitePlan[] }) {
  return (
    <ul className="plan-grid">
      {plans.map((plan) => (
        <li key={plan.id}>
          <a className="plan-card" href={planPath(plan.slug)}>
            <PlanCover plan={plan} className="plan-card__cover" />
            <h3 className="plan-card__title">{plan.title}</h3>
            <p className="plan-card__meta">{planMetaLabel(plan)}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The store badges and the device-aware /download link. */
export function PlanAppLinks() {
  return (
    <>
      <div className="plan-stores">
        <a href={EVERYBIBLE_APP_STORE_URL}>
          <img {...appStoreBadge} alt="Download on the App Store" />
        </a>
        <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>
          <img {...googlePlayBadge} alt="Get it on Google Play" />
        </a>
      </div>
      <p>
        <a href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>Get the app for this phone</a>
      </p>
    </>
  );
}
