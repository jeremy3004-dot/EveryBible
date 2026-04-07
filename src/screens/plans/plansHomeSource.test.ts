import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'PlansHomeScreen.tsx'), 'utf8');
const tabRowBlockMatch = source.match(/tabRow:\s*\{[\s\S]*?\n\s*\},/);
const planCardMetaBlockMatch = source.match(/planCardMeta:\s*\{[\s\S]*?\n\s*\},/);

test('PlansHomeScreen renders the tab control as a single horizontal row', () => {
  assert.match(
    source,
    /<ScrollView\s+horizontal[\s\S]*contentContainerStyle=\{styles\.tabRow\}/s,
    'PlansHomeScreen should render the tabs inside a horizontal ScrollView so long labels do not wrap into tall capsules'
  );
  assert.match(
    source,
    /stickyHeaderIndices=\{\[1\]\}/,
    'PlansHomeScreen should keep the tab strip in a sticky header so the title can scroll away without covering content'
  );
  assert.ok(tabRowBlockMatch, 'PlansHomeScreen should define a tabRow style block');
  assert.doesNotMatch(
    tabRowBlockMatch?.[0] ?? '',
    /flexWrap:\s*'wrap'/,
    'PlansHomeScreen should not wrap the plan tabs into multiple rows'
  );
});

test('PlansHomeScreen keeps each tab label to one line', () => {
  assert.match(
    source,
    /numberOfLines=\{1\}/,
    'PlansHomeScreen should keep each tab label on one line so the pills stay compact'
  );
  assert.match(
    source,
    /flexShrink:\s*0/,
    'PlansHomeScreen should let each pill keep its natural width rather than collapsing vertically'
  );
});

test('PlansHomeScreen no longer uses a fixed contentArea shell beneath the tabs', () => {
  assert.doesNotMatch(
    source,
    /contentArea:\s*\{/,
    'PlansHomeScreen should render the active tab content directly in the main scroll surface instead of a separate fixed contentArea'
  );
});

test('PlansHomeScreen keeps the plan day badge and action badge on one row', () => {
  assert.ok(planCardMetaBlockMatch, 'PlansHomeScreen should define a planCardMeta style block');
  assert.match(
    planCardMetaBlockMatch?.[0] ?? '',
    /justifyContent:\s*'space-between'/,
    'PlansHomeScreen should push the action badge to the right edge of the card row'
  );
  assert.doesNotMatch(
    planCardMetaBlockMatch?.[0] ?? '',
    /flexWrap:\s*'wrap'/,
    'PlansHomeScreen should keep the day badge and action badge on a single line'
  );
  assert.match(
    source,
    /flexShrink:\s*0/,
    'PlansHomeScreen should keep both badges from collapsing or wrapping when the day value gets longer'
  );
});
