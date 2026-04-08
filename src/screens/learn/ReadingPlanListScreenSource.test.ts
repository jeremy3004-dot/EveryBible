import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ReadingPlanListScreen keeps start-plan navigation separate from swipe delete and uses compact pill actions', () => {
  const source = readRelativeSource('./ReadingPlanListScreen.tsx');

  assert.equal(
    source.includes('unenrollFromPlan'),
    true,
    'ReadingPlanListScreen should import unenrollFromPlan so swipe delete can remove plans from my plans and completed'
  );

  assert.match(
    source,
    /ReanimatedSwipeable|Swipeable/,
    'ReadingPlanListScreen should wrap plan rows in a swipeable container for delete gestures'
  );

  assert.equal(
    source.includes('splitReadingPlanSections(plans, progressByPlanId)'),
    true,
    'ReadingPlanListScreen should split active plans away from completed plans with a shared model'
  );

  assert.equal(
    source.includes("kind: 'completed-plan'"),
    true,
    'ReadingPlanListScreen should render completed plans in their own section'
  );

  assert.match(
    source,
    /onStartPlan=\{\(\) => handleStartPlan\(item\.plan\)\}/,
    'ReadingPlanListScreen should keep the start-plan button on its own handler instead of routing through the card press'
  );

  assert.equal(
    source.includes('minWidth: 90'),
    false,
    'ReadingPlanListScreen should not force the start-plan button wider than the duration chips'
  );

  assert.equal(
    source.includes('planPill'),
    true,
    'ReadingPlanListScreen should use a shared pill style so the 365d, 90d, enrolled, and start-plan controls match'
  );
});
