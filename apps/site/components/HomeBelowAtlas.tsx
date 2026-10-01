/* eslint-disable @next/next/no-img-element -- plan covers are pre-sized 800 px WebP
   plates; a plain <img> keeps this section a server component (see PlanCover). */
import { type HomeCopy, homeCopyEn, fillCopy } from '../lib/home-copy';
import { selectHomePlans } from '../lib/home-plans';
import { getPlans, planCoverPath, planPath, PLAN_COVER_SIZE, PLANS_PATH } from '../lib/plan-pages';
import { DownloadCard } from './home/DownloadCard';
import { ScreenshotRail } from './home/ScreenshotRail';
import './home/home.css';

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AppShowcase({ copy }: { copy: HomeCopy['app'] }) {
  return (
    <section className="home-section home-app" id="app" aria-labelledby="home-app-title">
      <div className="wrap">
        <header className="home-section__header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="home-app-title">{copy.title}</h2>
          <p className="home-section__lede">{copy.lede}</p>
          <ul className="home-promises">
            {copy.promises.map((promise) => (
              <li key={promise}>
                <Check />
                {promise}
              </li>
            ))}
          </ul>
        </header>
      </div>
      <div className="wrap home-app__rail">
        <ScreenshotRail copy={copy} />
      </div>
      <div className="wrap">
        <DownloadCard copy={copy.download} />
      </div>
    </section>
  );
}

function Mission({ copy }: { copy: HomeCopy['mission'] }) {
  return (
    <section className="home-section home-mission" id="mission" aria-labelledby="home-mission-quote">
      <div className="wrap home-mission__inner">
        <p className="eyebrow">{copy.eyebrow}</p>
        <blockquote className="home-mission__quote">
          <p id="home-mission-quote">{copy.quote}</p>
        </blockquote>
        <div className="home-mission__story">
          {copy.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
        </div>
        <div className="home-actions">
          <a className="home-button" href="/give">
            {copy.giveCta}
          </a>
          <a className="home-link" href="/about">
            {copy.aboutCta}
          </a>
        </div>
      </div>
    </section>
  );
}

function PlansShelf({ copy }: { copy: HomeCopy['plans'] }) {
  const { seasonal, plans } = selectHomePlans(getPlans(), new Date());
  if (plans.length === 0) return null;
  return (
    <section
      className="home-section home-plans"
      id="plans-season"
      aria-labelledby="home-plans-title"
    >
      <div className="wrap">
        <header className="home-section__header">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="home-plans-title">{seasonal ? copy.seasonTitle : copy.title}</h2>
          <p className="home-section__lede">{copy.lede}</p>
        </header>
        <ul className="home-plans__grid">
          {plans.map((plan) => (
            <li key={plan.id}>
              <a className="home-plan" href={planPath(plan.slug)}>
                <img
                  className="home-plan__cover"
                  src={planCoverPath(plan)}
                  width={PLAN_COVER_SIZE.width}
                  height={PLAN_COVER_SIZE.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <h3>{plan.title}</h3>
                <p>{fillCopy(copy.days, { count: plan.durationDays })}</p>
              </a>
            </li>
          ))}
        </ul>
        <div className="home-actions">
          <a className="home-link" href={PLANS_PATH}>
            {copy.allPlans}
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Everything under the full-screen atlas: the app and where to get it, the
 * mission, and a shelf of reading plans. A server component; only the
 * screenshot rail and the download card hydrate.
 */
export function HomeBelowAtlas({ copy = homeCopyEn }: { copy?: HomeCopy }) {
  return (
    <>
      <AppShowcase copy={copy.app} />
      <Mission copy={copy.mission} />
      <PlansShelf copy={copy.plans} />
    </>
  );
}
