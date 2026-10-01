import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  PlanAppLinks,
  PlanCards,
  PlanCover,
  PlanLayout,
} from '../../../components/plans/PlanLayout';
import {
  blockSpanLabel,
  dayBlocks,
  dayLabel,
  getPlanBySlug,
  getPlans,
  planGroupId,
  planHeading,
  planFactsLine,
  planMetaLabel,
  planPageMetadata,
  planPageStructuredData,
  PLANS_PATH,
  planScheduleSentence,
  planSnapshot,
  readingLabel,
  readingPath,
  relatedPlans,
  shouldBlockDays,
} from '../../../lib/plan-pages';
import { getPlanCopy, highlightLink } from '../../../lib/plan-copy';
import type { PlanDay, PlanReading, SitePlan } from '../../../lib/plan-snapshot';
import { EVERYBIBLE_SMART_DOWNLOAD_PATH } from '../../../lib/site-links';
import { serializeJsonLd } from '../../../lib/site-metadata';
import '../plans.css';

/** Every plan is known at build time; any other slug is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getPlans().map(({ slug }) => ({ slug }));
}

interface PlanRouteProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PlanRouteProps): Promise<Metadata> {
  const plan = getPlanBySlug((await params).slug);
  if (!plan) notFound();
  return planPageMetadata(plan);
}

function Readings({ readings }: { readings: readonly PlanReading[] }) {
  return (
    <ul className="plan-readings">
      {readings.map((reading, index) => (
        <li key={index}>
          <a href={readingPath(reading)}>{readingLabel(reading)}</a>
        </li>
      ))}
    </ul>
  );
}

/** The hand-written introduction, the passages worth knowing, and the plan's numbers. */
function About({ plan }: { plan: SitePlan }) {
  const copy = getPlanCopy(plan.slug);
  const schedule = planScheduleSentence(plan);
  return (
    <section aria-labelledby="about-heading" className="plan-about">
      <h2 id="about-heading">About this plan</h2>
      {copy?.intro.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {copy && copy.highlights.length > 0 && (
        <>
          <h3 id="highlights-heading">What you’ll read</h3>
          <ul className="plan-highlights" aria-labelledby="highlights-heading">
            {copy.highlights.map((item) => {
              const { first, rest, path } = highlightLink(item.refs);
              return (
                <li key={item.label}>
                  <span className="plan-highlight__label">{item.label}</span>
                  <span className="plan-highlight__days">{item.days}</span>
                  <span className="plan-highlight__refs">
                    <a href={path}>{first}</a>
                    {rest && `, ${rest}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="plan-facts">{planFactsLine(plan)}</p>
      {schedule && <p className="plan-note">{schedule}</p>}
    </section>
  );
}

/** One row per day; a multi-session day lists its sessions under the day label. */
function DayList({ plan, days }: { plan: SitePlan; days: readonly PlanDay[] }) {
  return (
    <ol className="plan-days">
      {days.map((day) => {
        const [only] = day.sessions;
        return (
          <li key={day.day} id={`day-${day.day}`} className="plan-day">
            <span className="plan-day__label">{dayLabel(plan, day.day)}</span>
            {day.sessions.length === 1 && !only.label ? (
              <Readings readings={only.readings} />
            ) : (
              <dl className="plan-sessions">
                {day.sessions.map((session) => (
                  <div key={session.label}>
                    <dt>{session.label}</dt>
                    <dd>
                      <Readings readings={session.readings} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Long plans fold into blocks of 30 days; the first block starts open. */
function Schedule({ plan }: { plan: SitePlan }) {
  if (!shouldBlockDays(plan)) return <DayList plan={plan} days={plan.days} />;
  return dayBlocks(plan.days).map((block, index) => (
    <details key={block.first} className="plan-block" open={index === 0}>
      <summary>
        <span className="plan-block__days">
          Days {block.first}–{block.last}
        </span>
        <span className="plan-block__span">{blockSpanLabel(block.days)}</span>
      </summary>
      <DayList plan={plan} days={block.days} />
    </details>
  ));
}

export default async function PlanDetailPage({ params }: PlanRouteProps) {
  const plan = getPlanBySlug((await params).slug);
  if (!plan) notFound();

  const group = planSnapshot.groupLabels[planGroupId(plan)];
  const related = relatedPlans(plan);

  return (
    <PlanLayout current={plan.title}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(planPageStructuredData(plan)) }}
      />

      <section className="static-page__hero plan-hero">
        <PlanCover plan={plan} className="plan-hero__cover" priority />
        <p className="eyebrow">
          {group} · {planMetaLabel(plan)}
        </p>
        <h1>{planHeading(plan)}</h1>
        <p>{plan.description}</p>
        <a className="plan-cta" href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>
          Start this plan in the EveryBible app
        </a>
      </section>

      <article className="static-page__content">
        <About plan={plan} />

        <section aria-labelledby="schedule-heading">
          <h2 id="schedule-heading">Reading schedule</h2>
          <p className="plan-note">Each reading links to its chapter in the Bible.</p>
          <Schedule plan={plan} />
        </section>

        <section aria-labelledby="start-heading">
          <h2 id="start-heading">Start this plan in the EveryBible app</h2>
          <p>
            EveryBible is free for iPhone and Android. In the app, open Plans, choose Find plans and
            search for “{plan.title}”.
          </p>
          <PlanAppLinks />
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related-heading">
            <h2 id="related-heading">Related plans</h2>
            <PlanCards plans={related} />
            <p>
              <a href={PLANS_PATH}>Browse all reading plans</a>
            </p>
          </section>
        )}
      </article>
    </PlanLayout>
  );
}
