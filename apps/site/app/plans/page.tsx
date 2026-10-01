import type { Metadata } from 'next';

import { PlanAppLinks, PlanCards, PlanLayout } from '../../components/plans/PlanLayout';
import {
  getPlans,
  groupPlans,
  PLANS_HUB_TITLE,
  PLANS_PATH,
  plansHubDescription,
  plansHubStructuredData,
} from '../../lib/plan-pages';
import { pageMetadata, serializeJsonLd } from '../../lib/site-metadata';
import './plans.css';

export const metadata: Metadata = pageMetadata({
  title: PLANS_HUB_TITLE,
  description: plansHubDescription(),
  path: PLANS_PATH,
});

export default function PlansPage() {
  const plans = getPlans();
  const groups = groupPlans(plans);

  return (
    <PlanLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(plansHubStructuredData(plans)) }}
      />

      <section className="static-page__hero">
        <p className="eyebrow">Reading plans</p>
        <h1>Bible reading plans</h1>
        <p>
          {plans.length} free plans from the EveryBible app, from the whole Bible in a year to seven
          days for anxiety, loss or fear. See every day’s readings here, then start a plan in the
          app.
        </p>
        <nav aria-label="Plan categories" className="plan-jump">
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                <a href={`#${group.id}`}>{group.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <article className="static-page__content plans-catalog">
        {groups.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`}>
            <h2 id={`${group.id}-heading`}>
              {group.label} <span className="plan-count">{group.plans.length}</span>
            </h2>
            <PlanCards plans={group.plans} />
          </section>
        ))}

        <section aria-labelledby="app-heading">
          <h2 id="app-heading">Read along in EveryBible</h2>
          <p>
            EveryBible is a free Bible app for iPhone and Android. Start any of these plans in the
            Plans tab: it keeps your place and opens each day’s reading in the Bible.
          </p>
          <PlanAppLinks />
        </section>
      </article>
    </PlanLayout>
  );
}
