import Fuse from 'fuse.js';
import type { TFunction } from 'i18next';
import type { ReadingPlan } from '../../../services/plans/types';
import { formatPlanCadenceLabel } from './plansHomeModel';

/** A catalog plan with the translated text a reader could search for. */
export interface SearchablePlan {
  plan: ReadingPlan;
  title: string;
  description: string;
  cadence: string;
  category: string;
}

export function buildSearchablePlans(allPlans: ReadingPlan[], t: TFunction): SearchablePlan[] {
  return allPlans.map((plan) => ({
    plan,
    title: t(plan.title_key as Parameters<TFunction>[0], { defaultValue: plan.title_key }),
    description: plan.description_key
      ? t(plan.description_key as Parameters<TFunction>[0], {
          defaultValue: plan.description_key,
        })
      : '',
    cadence: formatPlanCadenceLabel(plan, t) ?? '',
    category: plan.category ?? 'other',
  }));
}

export function createPlanSearchIndex(searchablePlans: SearchablePlan[]): Fuse<SearchablePlan> {
  return new Fuse(searchablePlans, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: ['title', 'description', 'cadence', 'category', 'plan.slug'],
  });
}

/**
 * The catalog narrowed to a query: plans whose title, description, cadence or slug
 * contain it come first, then fuzzy matches (which forgive a typo), each plan once.
 * A blank query is the whole catalog.
 */
export function filterCatalogPlans(
  allPlans: ReadingPlan[],
  searchablePlans: SearchablePlan[],
  searchIndex: Fuse<SearchablePlan>,
  query: string
): ReadingPlan[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return allPlans;
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const substringMatches = searchablePlans
    .filter(({ title, description, cadence, plan }) =>
      [title, description, cadence, plan.slug].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
    .map(({ plan }) => plan);
  const fuzzyMatches = searchIndex.search(trimmedQuery).map((result) => result.item.plan);

  return [
    ...new Map([...substringMatches, ...fuzzyMatches].map((plan) => [plan.id, plan])).values(),
  ];
}
