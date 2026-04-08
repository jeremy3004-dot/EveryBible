import test from 'node:test';
import assert from 'node:assert/strict';

test('bundled reading plans expose the core eight plans in sort order', async () => {
  const mod = await import('./readingPlans.generated');

  assert.equal(mod.readingPlans.length, 8);
  assert.deepEqual(
    mod.readingPlans.map((plan) => plan.slug),
    [
      'bible-in-1-year',
      'new-testament-90-days',
      'psalms-30-days',
      'gospels-60-days',
      'proverbs-31-days',
      'genesis-to-revelation-chronological',
      'epistles-30-days',
      'sermon-on-the-mount-7-days',
    ]
  );

  assert.ok(mod.readingPlans.every((plan) => typeof plan.coverKey === 'string'));
  assert.equal(mod.readingPlanEntriesByPlanId['bible-in-1-year'].length, 365);
  assert.equal(mod.readingPlanEntriesByPlanId['sermon-on-the-mount-7-days'].length, 7);
});

