import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'PlansHomeScreen.tsx'), 'utf8');
const tabsBlockMatch = source.match(/const tabs:[\s\S]*?\n\s*\];/);
const planRowBlockMatch = source.match(/planRow:\s*\{[\s\S]*?\n\s*\},/);
const startButtonBlockMatch = source.match(/startButton:\s*\{[\s\S]*?\n\s*\},/);
const softChipBlockMatch = source.match(/chip:\s*\{[\s\S]*?\n\s*\},/);
const rhythmCardBlockMatch = source.match(/rhythmCard:\s*\{[\s\S]*?\n\s*\},/);
const rhythmCoverBlockMatch = source.match(/rhythmCoverFrame:\s*\{[\s\S]*?\n\s*\},/);
const searchStripBlockMatch = source.match(/searchStrip:\s*\{[\s\S]*?\n\s*\},/);
const swipeableRowMatches = source.match(/SwipeablePlanRow/g) ?? [];

test('PlansHomeScreen renders the tab control as one full-width segmented switch', () => {
  assert.match(
    source,
    /<TabSwitch\b/,
    'PlansHomeScreen should render the three plan tabs through the shared EL TabSwitch primitive'
  );
  assert.match(
    source,
    /<TabSwitch\s+fullWidth\s+size="md"/,
    'The plans switch is the full-width, three-equal-segment form of TabSwitch (13px labels, 7pt vertical padding)'
  );
  assert.doesNotMatch(
    source,
    /tabUnderline|styles\.tabRow/,
    'PlansHomeScreen should no longer draw the old underline tab strip'
  );
  assert.doesNotMatch(
    source,
    /<ScrollView\s+horizontal/s,
    'PlansHomeScreen should not wrap the tab row in a horizontal ScrollView that would let it overflow the screen'
  );
  assert.match(
    source,
    /stickyHeaderIndices=\{\[1\]\}/,
    'PlansHomeScreen should keep the tab strip in a sticky header so the title can scroll away without covering content'
  );
  assert.ok(tabsBlockMatch, 'PlansHomeScreen should define the top tab list');
  assert.doesNotMatch(
    tabsBlockMatch?.[0] ?? '',
    /key:\s*'saved'/,
    'PlansHomeScreen should not show the saved tab in the top navigation anymore'
  );
  for (const key of ["'my-plans'", "'find-plans'", "'completed'"]) {
    assert.match(
      tabsBlockMatch?.[0] ?? '',
      new RegExp(`key:\\s*${key}`),
      `PlansHomeScreen should keep the ${key} segment in the plans switch`
    );
  }
});

test('PlansHomeScreen leads with the plan-status eyebrow above the display title', () => {
  assert.match(
    source,
    /t\('readingPlans\.activeCount', \{ count: activeCount \}\)/,
    'The header eyebrow should count active plans from the user\u2019s own progress'
  );
  assert.match(
    source,
    /t\('readingPlans\.completedCount', \{ count: completedCount \}\)/,
    'The header eyebrow should count completed plans from the user\u2019s own progress'
  );
  assert.match(
    source,
    /return allPlans\.length > 0 \? t\('readingPlans\.plansCount', \{ count: allPlans\.length \}\) : '';/,
    'With nothing enrolled the eyebrow should fall back to the catalog size rather than reading "0 ACTIVE"'
  );
  assert.match(
    source,
    /\.\.\.typography\.displayHero,/,
    'The plans title is the 32px EL display hero, not the old 34px screenTitle override'
  );
  assert.match(
    source,
    /paddingBottom: contentClearance/,
    'The plans scroll surface must clear the floating tab bar via useTabBarHeight()'
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

test('PlansHomeScreen renders browse plans as rows with a Start outline or an Enrolled soft chip', () => {
  assert.ok(planRowBlockMatch, 'PlansHomeScreen should define a planRow style block');
  assert.match(
    planRowBlockMatch?.[0] ?? '',
    /paddingVertical:\s*10/,
    'Browse rows are 10pt vertical / 12pt horizontal inside one paper card'
  );
  assert.match(planRowBlockMatch?.[0] ?? '', /paddingHorizontal:\s*12/);
  assert.match(
    source,
    /planRowDivider:\s*\{[\s\S]*?borderTopColor:\s*colors\.borderStrong/,
    'Rows are separated by 1px borderStrong hairlines, not gaps between cards'
  );
  assert.match(
    source,
    /const ROW_COVER_SIZE = 52;/,
    'Row covers are 52x52 with a 1px frame at the small radius'
  );

  assert.ok(startButtonBlockMatch, 'PlansHomeScreen should define the Start outline button');
  assert.match(startButtonBlockMatch?.[0] ?? '', /borderWidth:\s*1/);
  assert.match(startButtonBlockMatch?.[0] ?? '', /borderRadius:\s*radius\.md/);
  assert.match(startButtonBlockMatch?.[0] ?? '', /paddingVertical:\s*6/);
  assert.match(startButtonBlockMatch?.[0] ?? '', /paddingHorizontal:\s*12/);
  assert.match(
    source,
    /styles\.startButton,\s*\{ borderColor: colors\.accentPrimary \}/,
    'Start is accent text inside an accent hairline, never a filled pill'
  );

  assert.ok(softChipBlockMatch, 'PlansHomeScreen should define the soft status chip');
  assert.match(softChipBlockMatch?.[0] ?? '', /paddingVertical:\s*5/);
  assert.match(softChipBlockMatch?.[0] ?? '', /paddingHorizontal:\s*9/);
  assert.match(softChipBlockMatch?.[0] ?? '', /borderRadius:\s*radius\.sm/);
  assert.match(
    source,
    /backgroundColor: colors\.successSoft/,
    'Enrolled/completed read as a soft success chip, not a filled accent pill'
  );
  assert.match(source, /color: colors\.onSuccessSoft/);
  assert.match(
    source,
    /typography\.monoSmall/,
    'The soft chip carries the 11px uppercase mono token'
  );

  assert.doesNotMatch(
    source,
    /durationBadge|enrollBadge/,
    'PlansHomeScreen should have dropped the old "31d" duration pill and the filled Enrolled pill'
  );
  assert.doesNotMatch(
    source,
    /interface\.daysShort/,
    'The compact "365d" pill copy is gone; rows carry a "365 DAYS" eyebrow instead'
  );
  assert.match(
    source,
    /flexShrink:\s*0/,
    'The trailing chip/button must keep its natural width rather than collapsing when the title runs long'
  );
});

test('PlansHomeScreen renders daily rhythms as a two-up cover grid', () => {
  assert.ok(rhythmCardBlockMatch, 'PlansHomeScreen should define the two-up rhythm card');
  assert.match(
    rhythmCardBlockMatch?.[0] ?? '',
    /flexBasis:\s*'48%'/,
    'Rhythm cards sit two to a row and wrap'
  );
  assert.match(
    source,
    /rhythmGrid:\s*\{[\s\S]*?flexWrap:\s*'wrap'[\s\S]*?gap:\s*10/,
    'The rhythm grid is a 10pt-gap wrapping row'
  );
  assert.ok(rhythmCoverBlockMatch, 'PlansHomeScreen should frame the rhythm cover');
  assert.match(
    rhythmCoverBlockMatch?.[0] ?? '',
    /aspectRatio:\s*RHYTHM_COVER_ASPECT/,
    'Rhythm covers are 16:10 inside a 1px cardBorder frame'
  );
  assert.match(rhythmCoverBlockMatch?.[0] ?? '', /borderColor:\s*colors\.cardBorder/);
  assert.match(
    source,
    /const RHYTHM_COVER_ASPECT = 16 \/ 10;/,
    'The rhythm cover aspect ratio is 16:10'
  );
  assert.match(
    source,
    /<Check size=\{12\} color=\{colors\.success\} strokeWidth=\{2\} \/>/,
    'Enrolled rhythms show a 12pt success check ahead of the eyebrow'
  );
  assert.doesNotMatch(
    source,
    /Ionicons/,
    'PlansHomeScreen renders Lucide glyphs now, not Ionicons'
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
    /useReadingPlansStore\(\(state\) => state\.progressByPlanId\)/,
    'PlansHomeScreen should derive both active and completed plan rows from the shared reading plans store'
  );
  assert.match(
    source,
    /const result = await unenrollFromPlan\(planId\);[\s\S]*if \(!result\.success && result\.error\)/,
    'PlansHomeScreen should let swipe delete update the shared store through unenrollFromPlan instead of manually mutating duplicate local arrays'
  );
});

test('PlansHomeScreen no longer surfaces the rhythms feature', () => {
  assert.doesNotMatch(
    source,
    /activeTopic|topicTabs|RhythmsHomeSection|RhythmsSection/,
    'PlansHomeScreen should keep the plans surface focused on reading plans only for now'
  );
  assert.doesNotMatch(
    source,
    /RhythmDetail|RhythmComposer|readingPlans\.rhythms|readingPlans\.createRhythm/,
    'PlansHomeScreen should not expose rhythm navigation or copy while the feature is disabled'
  );
});

test('PlansHomeScreen keeps My Plans on the main plans surface and sends add-plan into Find Plans', () => {
  assert.match(
    source,
    /activeTab === 'my-plans'[\s\S]*<MyPlansSection/s,
    'PlansHomeScreen should render My Plans directly from the main plans tabs'
  );
  assert.match(
    source,
    /activePlans\.length === 0[\s\S]*<EmptyState[\s\S]*cta=\{\{ label: t\('readingPlans\.addFirstPlan'\), onPress: onAddPlan \}\}/s,
    'PlansHomeScreen should show the add-plan CTA inside the shared EmptyState when there are no active plans yet'
  );
  assert.equal(
    source.includes('styles.iconButton'),
    false,
    'PlansHomeScreen should not show a redundant circular add-plan button above the empty state CTA'
  );
  assert.match(
    source,
    /const handleAddPlan = useCallback\(\(\) => {[\s\S]*setActiveTab\('find-plans'\);\s*}, \[\]\);/s,
    'PlansHomeScreen should route the plans CTA straight into the Find Plans tab'
  );
});

test('PlansHomeScreen splits repeating plans into a Daily Rhythms section', () => {
  assert.match(
    source,
    /const dailyReadingPlans = activePlans\.filter\(\(\{ plan \}\) => !isRecurringPlan\(plan\)\);/,
    'PlansHomeScreen should keep recurring rhythm plans out of the Daily Readings section'
  );
  assert.match(
    source,
    /const dailyRhythmPlans = activePlans\.filter\(\(\{ plan \}\) => isRecurringPlan\(plan\)\);/,
    'PlansHomeScreen should group recurring rhythm plans into a Daily Rhythms section'
  );
  assert.match(
    source,
    /<SectionHeader\s+title=\{t\('readingPlans\.dailyReadings'\)\}/,
    'PlansHomeScreen should relabel the primary active-plans section to Daily Readings'
  );
  assert.match(
    source,
    /dailyRhythmPlans\.length > 0[\s\S]*<SectionHeader\s+title=\{t\('readingPlans\.dailyRhythms'\)\}/s,
    'PlansHomeScreen should render a second section for recurring plans called Daily Rhythms'
  );
});

test('PlansHomeScreen adds a compact fuzzy-search field to Find Plans', () => {
  assert.match(
    source,
    /import Fuse from 'fuse\.js';/,
    'PlansHomeScreen should import Fuse for fuzzy plan search'
  );
  assert.match(
    source,
    /const \[searchQuery,\s*setSearchQuery\] = useState\(''\);/,
    'PlansHomeScreen should track the local Find Plans search query'
  );
  assert.match(
    source,
    /new Fuse\(searchablePlans,\s*\{/,
    'PlansHomeScreen should build a Fuse index over the plan catalog'
  );
  assert.match(
    source,
    /<TextInput[\s\S]*placeholder=\{t\('readingPlans\.searchPlansCount', \{ count: allPlans\.length \}\)\}/s,
    'The Find Plans search strip should name the catalog size ("Search 24 plans")'
  );
  assert.match(
    source,
    /searchQuery\.trim\(\) \? t\('readingPlans\.noPlanSearchResults'\) : t\('readingPlans\.noPlans'\)/,
    'PlansHomeScreen should show a dedicated empty state when a search yields no matches'
  );
  assert.ok(searchStripBlockMatch, 'PlansHomeScreen should define the 44pt search strip');
  assert.match(
    searchStripBlockMatch?.[0] ?? '',
    /height:\s*44/,
    'The Find Plans search strip is a 44pt paper strip, not a 48pt input well'
  );
  assert.match(searchStripBlockMatch?.[0] ?? '', /borderRadius:\s*radius\.lg/);
  assert.match(searchStripBlockMatch?.[0] ?? '', /borderColor:\s*colors\.cardBorder/);
  assert.match(
    source,
    /<Search size=\{17\} color=\{colors\.secondaryText\} strokeWidth=\{2\} \/>/,
    'The search strip leads with a 17pt Lucide search glyph in secondaryText'
  );
  assert.match(
    source,
    /const dailyRhythmPlans = filteredPlans\.filter\(\(plan\) => isRecurringPlan\(plan\)\);/,
    'PlansHomeScreen should carve recurring rhythm plans out of the Find Plans results'
  );
  assert.match(
    source,
    /const categoryPlans = filteredPlans\.filter\(\(plan\) => !isRecurringPlan\(plan\)\);/,
    'PlansHomeScreen should keep the category carousels focused on non-recurring plans'
  );
  assert.match(
    source,
    /dailyRhythmPlans\.length > 0[\s\S]*<SectionHeader\s+title=\{t\('readingPlans\.dailyRhythms'\)\}[\s\S]*eyebrow=\{t\('readingPlans\.plansCount'/s,
    'PlansHomeScreen should show a Daily Rhythms section inside Find Plans when repeating plans are available'
  );
});

test('PlansHomeScreen refreshes plan data again when the screen regains focus', () => {
  assert.match(
    source,
    /useFocusEffect/,
    'PlansHomeScreen should subscribe to navigation focus so My Plans can refresh after a plan is started elsewhere'
  );
  assert.match(
    source,
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*loadAllData\(true\)\.catch\(\(\) => \{\}\);\s*}, \[loadAllData\]\)\s*\)/s,
    'PlansHomeScreen should quietly reload plans on focus instead of only relying on the initial mount fetch'
  );
});

test('PlansHomeScreen renders bundled plans before remote plan-progress hydration finishes', () => {
  assert.match(
    source,
    /const hydratePlanProgress = useCallback\(async \(\) => \{\s*await getUserPlanProgress\(\)\.catch\(\(\) => \{\}\);\s*}, \[\]\);/s,
    'PlansHomeScreen should hydrate signed-in plan progress separately from the bundled plan catalog load'
  );
  assert.match(
    source,
    /const allPlansResult = await listReadingPlans\(\);/,
    'PlansHomeScreen should await the bundled plan catalog directly before rendering tabs'
  );
  assert.doesNotMatch(
    source,
    /Promise\.all\(\[\s*listReadingPlans\(\),\s*getUserPlanProgress\(\),\s*getCompletedPlans\(\),?\s*\]\)/s,
    'PlansHomeScreen should not block the bundled plan catalog on remote progress hydration'
  );
  assert.match(
    source,
    /void hydratePlanProgress\(\);/,
    'PlansHomeScreen should kick off plan-progress hydration in the background after rendering bundled plans'
  );
  assert.match(
    source,
    /loading && allPlans\.length === 0/,
    'PlansHomeScreen should only keep the loading spinner up while the bundled plan catalog itself is still empty'
  );
});

test('PlansHomeScreen renders no section header when the My Plans tab is empty', () => {
  const emptyStateBranch = source.match(/if \(activePlans\.length === 0\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(
    emptyStateBranch,
    'PlansHomeScreen should short-circuit MyPlansSection to the empty state before any section renders'
  );
  assert.match(
    emptyStateBranch,
    /<EmptyState/,
    'the empty My Plans branch should render the shared EmptyState'
  );
  assert.doesNotMatch(
    emptyStateBranch,
    /<SectionHeader/,
    'PlansHomeScreen should not render a section header above the empty My Plans state'
  );
  assert.match(
    source,
    /\{dailyReadingPlans\.length > 0 \? \([\s\S]*?<SectionHeader\s+title=\{t\('readingPlans\.dailyReadings'\)\}/s,
    'PlansHomeScreen should only render the Daily Readings header when that section has plans'
  );
  const completedSection = source.match(
    /function CompletedPlansSection\([\s\S]*?const createCompletedStyles/
  )?.[0];
  assert.ok(completedSection, 'CompletedPlansSection should be present');
  assert.match(
    completedSection,
    /if \(completedPlans\.length === 0\) \{\s*return \(\s*<EmptyState/s,
    'PlansHomeScreen should render the completed tab empty state without a section header'
  );
});
