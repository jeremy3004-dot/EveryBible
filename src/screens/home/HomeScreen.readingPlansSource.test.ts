import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen renders a compact continue-plan card below the verse card', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /selectHomeContinuePlans\(readingPlans, progressByPlanId\)/,
    'HomeScreen should derive the home resume cards from the shared plan-selection model'
  );

  assert.match(
    source,
    /t\('home\.plan'\)/,
    'HomeScreen should label the compact plan card with localized home copy'
  );

  assert.match(
    source,
    /t\('readingPlans\.dayOf',\s*{[\s\S]*current:\s*featuredPlanDay,[\s\S]*total:\s*featuredPlanDuration,/,
    'HomeScreen should show the active plan day when a plan is available'
  );

  assert.match(
    source,
    /t\('readingPlans\.browsePlans'\)/,
    'HomeScreen should fall back to browse copy when no featured plan is available'
  );

  assert.match(
    source,
    /featuredPlan[\s\S]*handleContinuePlan\(featuredPlan\.id\)[\s\S]*navigation\.navigate\('Plans',\s*\{\s*screen:\s*'PlansHome'\s*\}\)/,
    'HomeScreen should open the active plan detail screen when a resume card is tapped'
  );
});
