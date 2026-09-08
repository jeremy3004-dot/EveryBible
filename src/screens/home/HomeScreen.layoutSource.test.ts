import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen uses a bounce-enabled scroll shell while sizing itself against the tab bar height', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /<ScrollView[\s\S]*bounces[\s\S]*alwaysBounceVertical[\s\S]*overScrollMode="always"/,
    'HomeScreen should wrap the fixed layout in a bounce-enabled scroll container so pull-down gestures feel responsive'
  );

  assert.equal(
    source.includes('RefreshControl'),
    false,
    'HomeScreen should not depend on pull-to-refresh once it becomes a fixed layout'
  );

  assert.match(
    source,
    /getHomeScreenLayout\(screenWidth, screenHeight, bottomTabBarHeight\)/,
    'HomeScreen should size itself against the visible space after the bottom bar'
  );

  assert.match(
    source,
    /fontSize: homeLayout\.greetingFontSize,\s*lineHeight: homeLayout\.greetingLineHeight,/,
    'the hero greeting must scale with the layout model so 320pt phones drop to the 18pt greeting'
  );
});

test('HomeScreen lets the hero photograph bleed under the status bar', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes("edges={['top']}"),
    false,
    'the hero photograph runs to the top of the screen, so Home must not inset itself with a SafeAreaView top edge'
  );

  assert.match(
    source,
    /const insets = useSafeAreaInsets\(\);/,
    'HomeScreen should pad its own hero content by the safe-area inset instead of insetting the photograph'
  );

  assert.match(
    source,
    /paddingTop: insets\.top \+ HERO_TOP_PADDING/,
    'the greeting block should clear the status bar while the photograph stays full-bleed'
  );

  assert.match(
    source,
    /\{isFocused \? <StatusBar style="light" \/> : null\}/,
    'status bar glyphs must go light over the photograph, and revert when Home loses focus'
  );
});

test('HomeScreen reserves the floating tab bar below its final card', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /paddingBottom: tabBar\.contentClearance,/,
    'HomeScreen should reserve the floating tab capsule plus its breathing gap below the scroll content'
  );

  assert.match(
    source,
    /content:\s*{[\s\S]*flexGrow:\s*1,/,
    'HomeScreen should use flexGrow on the scroll content so the fixed layout still fills the screen while allowing elastic bounce'
  );
});

test('HomeScreen removes the extra welcome subtitle so the fixed layout can sit higher', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes("t('home.welcome')"),
    false,
    'HomeScreen should remove the extra welcome subtitle to free vertical space for the fixed layout'
  );
});

test('HomeScreen draws the hero scrim so the photograph dissolves into the page', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /const HERO_SCRIM_STOPS = \[\s*'rgba\(12, 11, 9, 0\.42\)',\s*'rgba\(12, 11, 9, 0\.05\)',\s*'rgba\(12, 11, 9, 0\.35\)',\s*'rgba\(12, 11, 9, 0\.72\)',\s*\] as const;/,
    'the hero scrim should use the four spec darkening stops'
  );

  assert.match(
    source,
    /const HERO_SCRIM_LOCATIONS = \[0, 0\.28, 0\.55, 0\.78, 1\] as const;/,
    'the hero scrim stops should sit at the spec locations'
  );

  assert.match(
    source,
    /\[\.\.\.HERO_SCRIM_STOPS, colors\.background\] as const/,
    'the final scrim stop must be the page colour so the photograph dissolves into the sheet in both scopes'
  );
});

test('HomeScreen renders a single Gather card for the active foundation', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /t\('tabs\.gather'\)[\s\S]*t\('gather\.foundationLabel'/,
    'HomeScreen should use localized Gather and foundation labels in the Gather card eyebrow'
  );

  assert.match(
    source,
    /t\('home\.lessonsProgress',\s*\{[\s\S]*completed: foundationCompletedLessons\.length,[\s\S]*total: foundation\.lessons\.length,/,
    'the Gather card should show the lesson counter for the active foundation'
  );

  assert.match(
    source,
    /t\('home\.nextLesson',\s*\{ title: nextLessonTitle \}\)/,
    'the Gather card should name the next unfinished lesson'
  );

  assert.equal(
    source.includes('CONTINUE IN FOUNDATIONS'),
    false,
    'HomeScreen should not hardcode the continuation eyebrow in English'
  );

  assert.equal(
    source.includes('GET STARTED'),
    false,
    'HomeScreen should not hardcode the foundation CTA eyebrow in English'
  );

  assert.equal(
    source.includes('gatherFoundations.slice(0, 4)'),
    false,
    'the four-node foundations path is retired — Home shows one Gather card for the active foundation'
  );

  assert.match(
    source,
    /<GatherIconBadge[\s\S]*artworkKey=\{foundation\.iconImage\}[\s\S]*size=\{28\}/,
    'the Gather card should render the active foundation artwork in a 28pt badge'
  );
});

test('HomeScreen renders the sheet cards at the spec geometry', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /const SHEET_PADDING_TOP = 20;/,
    'the vellum sheet should start 20pt below the hero action row'
  );

  assert.match(
    source,
    /const SHEET_CARD_MIN_HEIGHT = 120;/,
    'the paired Continue/Plan cards should hold a 120pt minimum height'
  );

  assert.match(
    source,
    /numeral:\s*{\s*\.\.\.typography\.numeralXL,/,
    'the chapter and plan-day numerals should use the 44pt display numeral token'
  );

  assert.match(
    source,
    /<ProgressBar progress=\{featuredPlanFraction\} style=\{styles\.planProgressBar\} \/>/,
    'the plan card should draw its progress as the shared 4pt rule'
  );
});

test('HomeScreen closes the sheet with the reading ledger below the Gather card', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  const gatherCardIndex = source.indexOf('style={styles.gatherCard}');
  const ledgerCardIndex = source.indexOf('style={styles.ledgerCard}');

  assert.ok(gatherCardIndex > 0, 'the Gather card should still render');
  assert.ok(
    ledgerCardIndex > gatherCardIndex,
    'the reading ledger is the final card on Home, so it must render below the Gather card'
  );

  assert.match(
    source,
    /<TabSwitch\s+segments=\{ledgerSegments\}\s+value=\{ledgerPeriod\}/,
    'the ledger period is chosen with the shared TabSwitch, not a bespoke control'
  );

  assert.match(
    source,
    /useState<HomeReadingPeriod>\('week'\)/,
    'a cold open should land on the current week, the scope a reader can still act on'
  );

  assert.match(
    source,
    /t\('home\.ledgerChapters'\)[\s\S]*t\('home\.ledgerChaptersCaption'\)[\s\S]*t\('home\.ledgerBooksFinished'\)/,
    'the ledger should list read, listened and finished rows in that order, all localized'
  );

  assert.match(
    source,
    /getHomeReadingStats\(\s*\{ chaptersRead, chaptersListened, listeningMsByDate \},/,
    'ledger figures must come from the pure stats model, not from inline maths in the screen'
  );
});

test('HomeScreen replaces Ionicons with Lucide glyphs', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes('Ionicons'),
    false,
    'HomeScreen should render Lucide glyphs, not the retired Ionicons set'
  );

  assert.match(
    source,
    /from 'lucide-react-native'/,
    'HomeScreen should import its glyphs from lucide-react-native'
  );
});
