import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { generatePlanSnapshot, PLANS_JSON, WEB_COVERS } from '../scripts/build-plan-pages';
import {
  buildPlanSnapshot,
  formatPlanSnapshot,
  type AppPlan,
  type AppPlanEntry,
  type PlanSnapshotSource,
} from './plan-snapshot';

test('the committed plans.json matches the app catalog (run npm run plans:pages)', () => {
  const regenerated = generatePlanSnapshot();
  const committed = readFileSync(PLANS_JSON, 'utf8');
  assert.deepEqual(JSON.parse(committed), regenerated);
  assert.equal(committed, formatPlanSnapshot(regenerated));
});

test('every plan has a web cover', () => {
  for (const plan of generatePlanSnapshot().plans)
    assert.ok(existsSync(new URL(`${plan.cover}.webp`, WEB_COVERS)), plan.cover);
});

const TEXT: Record<string, string> = {
  'plan.title': 'Plan',
  'plan.description': 'A plan.',
  'readingPlans.churchYear.heading': 'Church year',
  'readingPlans.dailyRhythms': 'Daily rhythms',
  'readingPlans.categoryLifeSituations': 'Seasons of life',
  'readingPlans.categoryChronological': 'Whole Bible',
  'readingPlans.categoryBookStudy': 'Book study',
  'readingPlans.categoryTopical': 'Topical',
  'readingPlans.categoryDevotional': 'Devotional',
  'readingPlans.morningLabel': 'Morning',
  'readingPlans.eveningLabel': 'Evening',
};

function source(plan: Partial<AppPlan>, entries: AppPlanEntry[]): PlanSnapshotSource {
  return {
    plans: [
      {
        id: 'plan',
        slug: 'plan',
        title_key: 'plan.title',
        description_key: 'plan.description',
        duration_days: 1,
        category: 'topical',
        sort_order: 1,
        coverKey: 'river',
        ...plan,
      },
    ],
    entriesByPlanId: { [plan.id ?? 'plan']: entries },
    text: (key) => TEXT[key],
    coverFiles: { river: 'shore' },
  };
}

const entry = (fields: Partial<AppPlanEntry>): AppPlanEntry => ({
  day_number: 1,
  book: 'JHN',
  chapter_start: 3,
  chapter_end: null,
  ...fields,
});

test('readings keep only the fields that narrow a whole chapter', () => {
  const snapshot = buildPlanSnapshot(
    source({}, [
      entry({ chapter_end: 3, verse_start: 16, verse_end: 21 }),
      entry({ book: 'GEN', chapter_start: 1, chapter_end: 3 }),
      entry({ book: 'PSA', chapter_start: 23, chapter_end: 23 }),
    ])
  );
  const [plan] = snapshot.plans;
  assert.equal(plan.cover, 'shore');
  assert.equal(plan.schedule, 'sequential');
  assert.deepEqual(plan.days, [
    {
      day: 1,
      sessions: [
        {
          label: null,
          readings: [
            { book: 'JHN', chapter: 3, verse: 16, toVerse: 21 },
            { book: 'GEN', chapter: 1, toChapter: 3 },
            { book: 'PSA', chapter: 23 },
          ],
        },
      ],
    },
  ]);
});

test('multi-session days split by session order, titled as the app titles them', () => {
  const [plan] = buildPlanSnapshot(
    source(
      {
        scheduleMode: 'calendar-day-of-week',
        format: 'multi-session',
        sessionOrder: ['morning', 'evening'],
      },
      [
        entry({ session_key: 'evening', book: 'PSA', chapter_start: 4 }),
        entry({ session_key: 'morning', session_title: 'Matins', book: 'PSA', chapter_start: 3 }),
      ]
    )
  ).plans;
  assert.equal(plan.schedule, 'weekly');
  assert.deepEqual(plan.sessions, ['Morning', 'Evening']);
  assert.deepEqual(
    plan.days[0].sessions.map((session) => session.label),
    ['Matins', 'Evening']
  );
});

test('catalog mistakes stop the build', () => {
  assert.throws(() => buildPlanSnapshot(source({}, [entry({ book: 'XYZ' })])), /Unknown book/);
  assert.throws(
    () => buildPlanSnapshot(source({}, [entry({ chapter_start: 22 })])),
    /out of range/
  );
  assert.throws(
    () => buildPlanSnapshot(source({ duration_days: 2 }, [entry({})])),
    /lists 1 of its 2 days/
  );
  assert.throws(
    () => buildPlanSnapshot(source({ title_key: 'missing' }, [entry({})])),
    /Missing English text for missing/
  );
  assert.throws(
    () => buildPlanSnapshot(source({ coverKey: 'nowhere' }, [entry({})])),
    /No cover file/
  );
});
