import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen renders a capped continue-reading plans section below the verse card', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /selectHomeContinuePlans\(readingPlans, progressByPlanId\)/,
    'HomeScreen should derive the home resume cards from the shared plan-selection model'
  );

  assert.match(
    source,
    /t\('readingPlans\.myPlans'\)/,
    'HomeScreen should label the resume section using the existing plans copy'
  );

  assert.match(
    source,
    /t\('common\.continue'\)/,
    'HomeScreen should expose a Continue call-to-action on each active plan card'
  );

  assert.match(
    source,
    /navigation\.navigate\('Plans',\s*{[\s\S]*screen:\s*'PlanDetail'/s,
    'HomeScreen should open the active plan detail screen when a resume card is tapped'
  );
});
