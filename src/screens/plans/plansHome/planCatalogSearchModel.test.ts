import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import type { ReadingPlan } from '../../../services/plans/types';
import {
  buildSearchablePlans,
  createPlanSearchIndex,
  filterCatalogPlans,
} from './planCatalogSearchModel';

const COPY: Record<string, string> = {
  'plan.psalms': 'Psalms in 30 Days',
  'plan.psalms.body': 'Pray through the psalter',
  'plan.epistles': 'The Epistles',
  'plan.kathisma': 'Kathisma Week',
  'readingPlans.morningLabel': 'Morning',
  'readingPlans.eveningLabel': 'Evening',
};
const t = ((key: string, options?: { defaultValue?: string }) =>
  COPY[key] ?? options?.defaultValue ?? key) as unknown as TFunction;

function makePlan(overrides: Partial<ReadingPlan>): ReadingPlan {
  return {
    id: 'plan',
    slug: 'plan',
    title_key: 'plan.title',
    description_key: null,
    duration_days: 30,
    category: 'book-study',
    is_active: true,
    sort_order: 0,
    coverKey: 'river',
    ...overrides,
  };
}

const psalms = makePlan({
  id: 'psalms',
  slug: 'psalms-30',
  title_key: 'plan.psalms',
  description_key: 'plan.psalms.body',
  category: 'devotional',
});
const epistles = makePlan({ id: 'epistles', slug: 'epistles-30', title_key: 'plan.epistles' });
const kathisma = makePlan({
  id: 'kathisma',
  slug: 'kathisma-weekly',
  title_key: 'plan.kathisma',
  scheduleMode: 'calendar-day-of-week',
  format: 'multi-session',
  sessionOrder: ['morning', 'evening'],
});
const untranslated = makePlan({ id: 'raw', slug: 'raw', title_key: 'plan.raw.title' });
const CATALOG = [psalms, epistles, kathisma, untranslated];

function search(query: string) {
  const searchable = buildSearchablePlans(CATALOG, t);
  return filterCatalogPlans(CATALOG, searchable, createPlanSearchIndex(searchable), query).map(
    (plan) => plan.id
  );
}

test('each plan is searchable by its translated title, description, cadence and category', () => {
  const [first, , third, fourth] = buildSearchablePlans(CATALOG, t);
  assert.deepEqual(
    { ...first, plan: first.plan.id },
    {
      plan: 'psalms',
      title: 'Psalms in 30 Days',
      description: 'Pray through the psalter',
      cadence: '',
      category: 'devotional',
    }
  );
  assert.equal(third.cadence, 'Morning + Evening');
  assert.equal(fourth.title, 'plan.raw.title', 'an untranslated title falls back to its key');
  assert.equal(fourth.description, '');
});

test('a blank query is the whole catalog, in catalog order', () => {
  assert.deepEqual(search(''), ['psalms', 'epistles', 'kathisma', 'raw']);
  assert.deepEqual(search('   '), ['psalms', 'epistles', 'kathisma', 'raw']);
});

test('a query matches title, description, cadence and slug, ignoring case', () => {
  assert.deepEqual(search('PSALMS'), ['psalms']);
  assert.deepEqual(search('psalter'), ['psalms']);
  assert.deepEqual(search('evening'), ['kathisma']);
  assert.deepEqual(search('kathisma-weekly'), ['kathisma']);
});

test('a typo still finds the plan, and each plan appears once', () => {
  assert.deepEqual(search('Epistels'), ['epistles']);
  const results = search('the');
  assert.equal(new Set(results).size, results.length);
});

test('a query nothing matches finds nothing', () => {
  assert.deepEqual(search('zzqxj'), []);
});
