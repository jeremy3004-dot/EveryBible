import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'PlansHomeScreen.tsx'), 'utf8');
const tabRowBlockMatch = source.match(/tabRow:\s*\{[\s\S]*?\n\s*\},/);
const planCardMetaBlockMatch = source.match(/planCardMeta:\s*\{[\s\S]*?\n\s*\},/);
const tabsBlockMatch = source.match(/const tabs:[\s\S]*?\n\s*\];/);
const planCardBlockMatch = source.match(/planCard:\s*\{[\s\S]*?\n\s*\},/);
const swipeableRowMatches = source.match(/SwipeablePlanRow/g) ?? [];

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
  assert.ok(tabsBlockMatch, 'PlansHomeScreen should define the top tab list');
  assert.doesNotMatch(
    tabsBlockMatch?.[0] ?? '',
    /key:\s*'saved'/,
    'PlansHomeScreen should not show the saved tab in the top navigation anymore'
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

test('PlansHomeScreen no longer renders a separate reading challenges section', () => {
  assert.doesNotMatch(
    source,
    /Reading Challenges/,
    'PlansHomeScreen should not surface a dedicated reading challenges header anymore'
  );
  assert.doesNotMatch(
    source,
    /getTimedChallengePlans/,
    'PlansHomeScreen should not fetch timed challenge plans for the main list UI anymore'
  );
});

test('PlansHomeScreen does not render a duplicate featured hero above the find-plans categories', () => {
  assert.doesNotMatch(
    source,
    /getFeaturedPlans|featuredPlans|featuredPlan|heroCard|heroImage|heroDurationBadge/,
    'PlansHomeScreen should not render or fetch a separate featured plan hero once the same plan already appears in the chronological section'
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
  assert.ok(planCardBlockMatch, 'PlansHomeScreen should define a planCard style block');
  assert.match(
    planCardBlockMatch?.[0] ?? '',
    /minHeight:\s*228/,
    'PlansHomeScreen should reserve extra vertical space so the action row sits lower in cards with shorter titles'
  );
  assert.match(
    source,
    /planCardBody:\s*\{\s*flex:\s*1,/s,
    'PlansHomeScreen should give the card body flexible space so the badge row can anchor to the bottom'
  );
  assert.match(
    planCardMetaBlockMatch?.[0] ?? '',
    /marginTop:\s*'auto'/,
    'PlansHomeScreen should pin the action row toward the bottom of the card body instead of letting it float upward'
  );
});

test('PlansHomeScreen supports swipe-to-delete for active and completed plans', () => {
  assert.match(
    source,
    /Swipeable/,
    'PlansHomeScreen should import a swipeable row wrapper so my plans and completed plans can be deleted with a left swipe'
  );
  assert.match(
    source,
    /unenrollFromPlan/,
    'PlansHomeScreen should reuse the existing unenroll flow for swipe delete'
  );
  assert.match(
    source,
    /function SwipeablePlanRow/,
    'PlansHomeScreen should define a reusable swipe-delete row wrapper'
  );
  assert.ok(
    swipeableRowMatches.length >= 3,
    'PlansHomeScreen should use the swipe-delete wrapper for the helper definition and both plan sections'
  );
  assert.match(
    source,
    /setCompletedPlans\(\(prev\) => prev\.filter\(\(item\) => item\.plan\.id !== planId\)\)/,
    'PlansHomeScreen should remove deleted plans from the completed section immediately after a successful swipe delete'
  );
  assert.match(
    source,
    /setUserProgress\(\(prev\) => prev\.filter\(\(progress\) => progress\.plan_id !== planId\)\)/,
    'PlansHomeScreen should also remove deleted plans from the active plans section immediately after a successful swipe delete'
  );
});

test('PlansHomeScreen includes a rhythms section in My Plans with create and detail navigation', () => {
  assert.match(
    source,
    /function RhythmsSection\(/,
    'PlansHomeScreen should define a dedicated RhythmsSection within My Plans'
  );
  assert.match(
    source,
    /<RhythmsSection[\s\S]*onRhythmPress=\{handleRhythmPress\}[\s\S]*onCreateRhythm=\{handleCreateRhythm\}/s,
    'PlansHomeScreen should wire the RhythmsSection into the My Plans tab'
  );
  assert.match(
    source,
    /navigation\.navigate\('RhythmDetail', \{ rhythmId \}\)/,
    'PlansHomeScreen should open the rhythm detail screen from the rhythms list'
  );
  assert.match(
    source,
    /navigation\.navigate\('RhythmComposer', \{\}\)/,
    'PlansHomeScreen should route rhythm creation into the composer screen'
  );
  assert.match(
    source,
    /<View style=\{styles\.headerContent\}>[\s\S]*<Text style=\{styles\.sectionTitle\}>\{t\('readingPlans\.rhythms'\)\}<\/Text>[\s\S]*<TouchableOpacity[\s\S]*style=\{styles\.createButton\}/s,
    'PlansHomeScreen should stack the create rhythm button below the rhythms title instead of keeping them on one row'
  );
});

test('PlansHomeScreen shows the Plans section before Rhythms in My Plans', () => {
  assert.match(
    source,
    /<Text style=\{styles\.sectionTitle\}>\{t\('readingPlans\.plans'\)\}<\/Text>/,
    'PlansHomeScreen should render a dedicated Plans section heading in My Plans'
  );
  assert.match(
    source,
    /activePlans\.length === 0 \? \(\s*<TouchableOpacity[\s\S]*<Text style=\{styles\.primaryButtonLabel\}>\{t\('readingPlans\.addFirstPlan'\)\}<\/Text>/s,
    'PlansHomeScreen should only show the add-plan button beneath the Plans heading when there are no active plans yet'
  );
  assert.match(
    source,
    /const handleAddPlan = useCallback\(\(\) => {\s*setActiveTab\('find-plans'\);\s*}, \[\]\);/s,
    'PlansHomeScreen should route the plans CTA to the Find Plans tab'
  );

  const plansIndex = source.indexOf("t('readingPlans.plans')");
  const rhythmsIndex = source.indexOf('<RhythmsSection');
  assert.ok(
    plansIndex !== -1 && rhythmsIndex !== -1 && plansIndex < rhythmsIndex,
    'PlansHomeScreen should render the Plans section before the Rhythms section on the My Plans page'
  );
});
