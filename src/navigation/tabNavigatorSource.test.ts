import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('collapsed tabs leave touch and accessibility navigation without fading native glass', () => {
  const source = readRelativeSource('./TabNavigator.tsx');
  assert.match(source, /useAnimatedReaction\(/);
  assert.match(source, /if \(hidden !== previous\)\s*\{\s*runOnJS\(setScrollHidden\)\(hidden\)/);
  assert.match(source, /forcedHidden \|\| \(followsScroll && scrollHidden\)/);
  assert.match(source, /pointerEvents=\{interactionHidden \? 'none' : 'box-none'\}/);
  assert.match(source, /accessibilityElementsHidden=\{interactionHidden\}/);
  assert.match(
    source,
    /importantForAccessibility=\{interactionHidden \? 'no-hide-descendants' : 'auto'\}/
  );
  assert.doesNotMatch(source, /opacity:/);
});

test('TabNavigator keeps the bottom tab bar flat instead of rounding its top corners', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('borderTopLeftRadius'),
    false,
    'TabNavigator should not round the top-left corner of the shared bottom tab bar'
  );

  assert.equal(
    source.includes('borderTopRightRadius'),
    false,
    'TabNavigator should not round the top-right corner of the shared bottom tab bar'
  );

  // The EL reskin adds a rounded accent pill behind the SELECTED TAB ICON, which
  // is a different element from the bar. Scope the guard to the bar style objects
  // so it still catches a radius creeping onto the bar itself.
  const barStyleStart = source.indexOf('const defaultTabBarStyle');
  const barStyleSource = source.slice(barStyleStart, source.indexOf('return (', barStyleStart));
  assert.ok(barStyleSource.length > 0, 'tab bar style block should be locatable');
  assert.equal(
    barStyleSource.includes('borderRadius'),
    false,
    'TabNavigator should not reintroduce a generic border radius on the shared bottom tab bar'
  );
});

test('TabNavigator collapses the tab bar when BibleReader hides it instead of hard-removing it', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /const getCollapsingTabBarStyle = useCallback\(\s*\(collapseProgress: number\) =>\s*buildTabBarCapsuleStyle\(\{/,
    'TabNavigator should define a progress-driven tab-bar style for reader-driven hide/show motion'
  );

  // Geometry lives in one place — see the de-duplication guard below.
  const capsuleSource = readFileSync(
    fileURLToPath(new URL('./tabBarCapsuleStyle.ts', import.meta.url).href),
    'utf8'
  );
  assert.match(
    capsuleSource,
    /transform:\s*\[\{\s*translateY:\s*getReaderTabBarTranslation\(collapseProgress\)\s*\}\]/s,
    'the collapsing capsule should slide clear of the screen, gap included'
  );

  assert.match(
    source,
    /tabBarCollapseProgress > 0\s*\?\s*getCollapsingTabBarStyle\(tabBarCollapseProgress\)[\s\S]*:\s*isBibleReader[\s\S]*\?\s*readerTabBarStyle[\s\S]*:\s*defaultTabBarStyle/s,
    'TabNavigator should choose between the normal and collapsing tab-bar styles from the reader progress signal'
  );
});

test('TabNavigator freezes inactive tabs so Home, Bible, and Gather do not keep repainting off-screen', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /freezeOnBlur:\s*true/,
    'TabNavigator should freeze inactive tabs to reduce lag while switching between Home, Bible, and Gather'
  );
});

test('TabNavigator keeps the tab bar padding compact instead of turning the bottom inset into a dark strip', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm'),
    false,
    'TabNavigator should not reserve the full bottom inset as extra internal padding'
  );

  assert.match(
    source,
    /bottomPadding:\s*tabBarBottomPadding,[\s\S]*barHeight:\s*tabBarBarHeight,[\s\S]*sideInset:\s*tabBarSideInset,[\s\S]*\} = useTabBarHeight\(\);/,
    'TabNavigator should take its capsule geometry from the shared useTabBarHeight hook'
  );

  assert.equal(
    source.includes('paddingTop: spacing.xs'),
    false,
    'TabNavigator should not add extra padding above the tab icons because that pushes the content lower'
  );

  // The capsule centres each tab's icon+label inside the selection pill rather
  // than nudging the row with item padding, so the item must fill the capsule
  // and contribute no padding of its own.
  assert.match(
    source,
    /tabBarItemStyle: styles\.tabItem,/,
    'tab items should use the shared style that fills the capsule'
  );
  assert.match(
    source,
    /tabItem:\s*\{\s*height: '100%',\s*paddingTop: 0,\s*paddingBottom: 0,\s*\}/s,
    'tab items should fill the capsule height and add no padding of their own'
  );
});

test('TabNavigator keeps the Bible store off the root tab render path', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.doesNotMatch(
    source,
    /import \{ useBibleStore \} from '\.\.\/stores\/bibleStore';/,
    'TabNavigator should not eagerly import the Bible store while rendering the app shell'
  );

  assert.match(
    source,
    /function getBibleTabResumeState\(\)[\s\S]*require\('\.\.\/stores\/bibleStore'\)/,
    'TabNavigator should load the Bible store only when Bible-tab resume state is needed'
  );
});

test('TabNavigator uses the base tab bar height instead of adding the bottom safe-area inset twice', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /import \{ useTabBarHeight, TAB_BAR_CAPSULE_RADIUS \} from '\.\.\/hooks\/useTabBarHeight';/,
    'TabNavigator should source its bar height from the shared useTabBarHeight hook, imported directly so the app shell does not evaluate the whole hooks barrel at boot'
  );

  assert.equal(
    source.includes('layout.tabBarBaseHeight + insets.bottom'),
    false,
    'TabNavigator should not stack the bottom inset onto the tab bar height itself — useTabBarHeight already accounts for it once'
  );

  assert.equal(
    source.includes('useSafeAreaInsets'),
    false,
    'TabNavigator should not call useSafeAreaInsets directly — it should go through the shared useTabBarHeight hook'
  );
});

test('TabNavigator fills the floating capsule with liquid glass, not opaque paper', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  // Native glass on iOS 26+, a tinted blur elsewhere; the tint is the paper
  // colour at partial alpha so the page shows through in both scopes.
  assert.match(source, /isLiquidGlassAvailable\(\) && isGlassEffectAPIAvailable\(\)/);
  assert.match(source, /<GlassView[\s\S]*?glassEffectStyle="clear"/);
  assert.match(source, /<BlurView[\s\S]*?tint=\{isDark \? 'dark' : 'light'\}/);
  assert.match(
    source,
    /const capsuleFill = useMemo\(\s*\(\) => hexWithAlpha\(colors\.cardBackground, 0\.62\)/,
    'the capsule tint should be the card surface at partial alpha'
  );
  assert.match(
    source,
    /const readerCapsuleFill = useMemo\(\s*\(\) => hexWithAlpha\(colors\.bibleSurface, 0\.62\)/,
    'the reader variant should tint off the reading surface'
  );
  assert.match(
    source,
    /capsule:\s*\{[\s\S]*?overflow: 'hidden',/,
    'the capsule should clip its glass to the rounded shape'
  );
  assert.doesNotMatch(
    source,
    /const capsuleFill = colors\.cardBackground;/,
    'the capsule must not be an opaque sheet'
  );
});

test('TabNavigator uses Bible reader colors while the reader is focused', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  // The capsule geometry is shared; only the material behind it retints, via
  // the tabBarBackground component.
  assert.match(
    source,
    /fill=\{isBibleReader \? readerCapsuleFill : capsuleFill\}/,
    'TabNavigator should tint the capsule off the reading surface while the reader is focused'
  );
  assert.match(
    source,
    /stroke=\{isBibleReader \? colors\.bibleDivider : colors\.cardBorder\}/,
    'the capsule edge should follow the reader divider while the reader is focused'
  );

  // The selected glyph sits on a neutral ink pill, so it reads in the scope's
  // primary text — the reader's own primary text while the reader is focused.
  assert.match(
    source,
    /tabBarActiveTintColor: isBibleReader \? colors\.biblePrimaryText : colors\.primaryText,/,
    'the selected tab glyph should use primary text, not the accent'
  );

  // Inactive glyphs are full ink — the pill alone carries selection — and they
  // follow the reader's own ink while the reader is focused.
  assert.match(
    source,
    /tabBarInactiveTintColor: isBibleReader \? colors\.biblePrimaryText : colors\.primaryText,/,
    'TabNavigator should keep inactive tab glyphs in primary ink, reader ink in the reader'
  );

  assert.match(
    source,
    /getCollapsingTabBarStyle\(tabBarCollapseProgress\)/,
    'TabNavigator should keep the reader theme while the reader-driven tab bar collapses'
  );
});

test('TabNavigator renders the tab bar as a floating glass capsule', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  // Home stays on the standard (non-collapsing) style — only the reader drives
  // the collapse.
  assert.match(
    source,
    /route\.name === 'Home'[\s\S]*return defaultTabBarStyle;/,
    'TabNavigator should keep Home on the standard tab-bar style instead of the collapsing overlay style'
  );

  // The capsule floats: inset from the edges, lifted off the bottom, and
  // transparent so the blurred background component provides the material.
  const capsuleSource = readFileSync(
    fileURLToPath(new URL('./tabBarCapsuleStyle.ts', import.meta.url).href),
    'utf8'
  );
  assert.match(
    capsuleSource,
    /backgroundColor: 'transparent',[\s\S]*start: sideInset,[\s\S]*end: sideInset,[\s\S]*bottom: bottomPadding,[\s\S]*height: barHeight,/s,
    'the tab bar should be an inset, lifted, transparent capsule'
  );
  assert.match(
    source,
    /buildTabBarCapsuleStyle\(\{/,
    'TabNavigator should build its bar from the shared capsule style'
  );
  assert.match(
    source,
    /<TabBarBackground\s+isDark=\{isDark\}\s+fill=/,
    'the capsule material should be supplied by the opaque paper background component'
  );

  // Keep all React Navigation v7 accessibility and interaction props intact.
  assert.match(
    source,
    /<PlatformPressable \{\.\.\.props\}/,
    'the tab button should preserve accessibility, links, test IDs, and press callbacks'
  );
  assert.match(
    source,
    /borderRadius: TAB_BAR_CAPSULE_RADIUS/,
    'the capsule should be fully rounded'
  );
});

test('TabNavigator hides BibleReader only when it is launched as a plan session', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /shouldHideTabBarOnNestedRoute/,
    'TabNavigator should use the shared nested-route visibility helper'
  );

  assert.match(
    source,
    /resolveActiveNestedRoute\(/,
    'TabNavigator should resolve the active nested route (including deeper stack state) before asking the helper whether to hide the bar'
  );

  assert.match(
    source,
    /getFocusedRouteNameFromRoute\(route as FocusedRouteArg\)/,
    'TabNavigator should continue resolving the focused nested route name via React Navigation before applying tab-bar visibility rules'
  );

  assert.match(
    source,
    /fallbackNestedRouteName = route\.params\?\.screen/,
    'TabNavigator should still fall back to the root tab route params when nested state has not populated yet'
  );

  assert.match(
    source,
    /fallbackNestedRouteParams = route\.params\?\.params/,
    'TabNavigator should read nested route params from the root tab route params during early plan-reader navigation'
  );
});

test('TabNavigator resumes the last open Bible chapter when the Bible tab is pressed from a cold start', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(source, /hasReaderHistory:\s*state\.hasReaderHistory/);
  assert.match(source, /currentBibleBook:\s*state\.currentBook/);
  assert.match(source, /currentBibleChapter:\s*state\.currentChapter/);

  assert.match(
    source,
    /listeners=\{\(\{ navigation, route \}\) =>/,
    'TabNavigator should attach a Bible tab-press listener so cold starts can resume into the reader stack'
  );

  assert.match(
    source,
    /const \{[\s\S]*hasReaderHistory,[\s\S]*currentBibleBook,[\s\S]*currentBibleChapter,[\s\S]*preferredBibleMode,?\s*\} =\s*getBibleTabResumeState\(\);[\s\S]*navigation\.navigate\('Bible', \{\s*screen:\s*'BibleReader',\s*params:\s*\{\s*bookId:\s*currentBibleBook,\s*chapter:\s*currentBibleChapter/s,
    'TabNavigator should reopen the Bible tab at the persisted reader chapter instead of always dumping the user back into the book list'
  );
});

test('TabNavigator clears preserved plan-session reader params when the Bible tab is pressed', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /typeof nestedRouteParams\?\.planId === 'string'/,
    'TabNavigator should detect when the preserved Bible tab route is still carrying a reading-plan session'
  );

  assert.match(
    source,
    /planId:\s*undefined/,
    'TabNavigator should explicitly clear the plan session id when reopening the shared Bible tab'
  );

  assert.match(
    source,
    /planDayNumber:\s*undefined/,
    'TabNavigator should clear the active plan day number so the normal Bible reader chrome returns'
  );

  assert.match(
    source,
    /sessionContext:\s*undefined/,
    'TabNavigator should clear any preserved rhythm session context when the user chooses the Bible tab itself'
  );
});

test('TabNavigator resets the Plans tab to PlansHome when the tab is pressed directly', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /name="Plans"[\s\S]*listeners=\{\(\{ navigation \}\) =>/,
    'TabNavigator should attach a tab-press listener to the Plans tab so direct taps can reopen the plans list'
  );

  assert.match(
    source,
    /event\.preventDefault\(\);/,
    'TabNavigator should intercept direct Plans-tab presses instead of reusing the preserved nested stack state'
  );

  assert.match(
    source,
    /navigation\.navigate\('Plans', \{\s*screen:\s*'PlansHome'/s,
    'TabNavigator should send direct Plans-tab presses back to PlansHome instead of reopening the last plan detail'
  );
});

test('the tab bar capsule geometry is defined in exactly one place', () => {
  // TabNavigator and BibleReaderScreen both set the root tab bar's style. They
  // used to carry separate copies, so the bar changed shape when entering or
  // leaving the reader. Both must go through the shared builder.
  for (const [file, source] of [
    ['TabNavigator.tsx', readRelativeSource('./TabNavigator.tsx')],
    [
      'BibleReaderScreen.tsx',
      readFileSync(
        fileURLToPath(new URL('../screens/bible/BibleReaderScreen.tsx', import.meta.url).href),
        'utf8'
      ),
    ],
  ] as const) {
    assert.match(
      source,
      /buildTabBarCapsuleStyle\(/,
      `${file} must build the root tab bar from the shared capsule style`
    );
    assert.doesNotMatch(
      source,
      /borderTopWidth: 1,[\s\S]{0,200}?left: 0,[\s\S]{0,200}?right: 0,[\s\S]{0,200}?bottom: 0,/,
      `${file} must not re-inline a full-width, flush-to-bottom tab bar`
    );
  }
});

test('the selected tab is a neutral ink pill inside the capsule padding', () => {
  const source = readRelativeSource('./TabNavigator.tsx');
  const selectionSource = readRelativeSource('./TabBarSelection.tsx');
  const capsuleSource = readRelativeSource('./tabBarCapsuleStyle.ts');

  // Primary text at low alpha: a grey that belongs to the scope, never the accent.
  assert.match(
    source,
    /const pillColor = hexWithAlpha\(isReader \? colors\.biblePrimaryText : colors\.primaryText, 0\.1\);/,
    'the sliding selection pill should be a neutral ink wash, not the accent surface'
  );
  assert.doesNotMatch(source, /pillColor = colors\.accentSurface/);

  // 6pt of paper on every side of a 64pt capsule leaves a 52pt pill, radius 26.
  assert.match(capsuleSource, /TAB_BAR_CAPSULE_ROW_INSET = 6;/);
  assert.match(selectionSource, /TAB_BAR_SELECTION_PILL_RADIUS = 26;/);
  assert.match(
    selectionSource,
    /pill:\s*\{[\s\S]*?top: TAB_BAR_CAPSULE_ROW_INSET,[\s\S]*?bottom: TAB_BAR_CAPSULE_ROW_INSET,[\s\S]*?start: TAB_BAR_CAPSULE_ROW_INSET,[\s\S]*?borderRadius: TAB_BAR_SELECTION_PILL_RADIUS,/,
    'the pill should be inset by the capsule padding on every side'
  );

  // Keep the sliding animation and its reduced-motion gate.
  assert.match(selectionSource, /withSpring\(selectedIndex, motion\.spring\)/);
  assert.match(selectionSource, /useReducedMotion\(\)/);
});

test('tab glyphs are 22pt Lucide strokes taken from the manifest', () => {
  const source = readRelativeSource('./TabNavigator.tsx');
  const manifestSource = readRelativeSource('./tabManifest.ts');

  assert.equal(
    source.includes('Ionicons'),
    false,
    'the tab bar should no longer draw Ionicons glyphs'
  );
  assert.match(source, /const TAB_BAR_ICON_SIZE = 22;/);
  assert.match(source, /const TAB_BAR_ICON_STROKE_WIDTH = 2;/);
  assert.match(
    source,
    /<TabBarIcon icon=\{TAB_BAR_ICONS\[tab\.iconName\]\} color=\{color\} \/>/,
    'the navigator should render whichever Lucide glyph the manifest names'
  );
  assert.match(
    source,
    /const TAB_BAR_ICONS: Record<RootTabIconName, LucideIcon> = \{\s*house: House,\s*'book-open': BookOpen,\s*users: Users,\s*calendar: Calendar,\s*ellipsis: Ellipsis,\s*\}/,
    'every glyph the manifest can name must be bound to a Lucide component'
  );

  // The manifest stays a pure data module so it remains importable in Node.
  assert.equal(
    manifestSource.includes("from 'lucide-react-native'"),
    false,
    'tabManifest should not pull react-native in through the Lucide barrel'
  );
  assert.match(
    manifestSource,
    /export type RootTabIconName =\s*'house' \| 'book-open' \| 'users' \| 'calendar' \| 'ellipsis';/,
    'the manifest stays the single source of truth for which glyph each tab draws'
  );
});

test('tab labels are 11pt semibold on top of the shared tabLabel token', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  // The navigator renders the label itself (instead of handing BottomTabItem a
  // string) so it can cap font scaling inside the fixed-height capsule.
  assert.match(
    source,
    /maxFontSizeMultiplier=\{TAB_BAR_LABEL_MAX_FONT_SCALE\}\s*style=\{\[styles\.tabLabel, \{ color \}\]\}/,
    'the tab label should be drawn from the shared tabLabel token with a capped font multiplier'
  );
  assert.match(
    source,
    /const TAB_BAR_LABEL_MAX_FONT_SCALE = 1\.6;/,
    'a 64pt capsule cannot absorb an unbounded accessibility text scale'
  );
  assert.match(
    source,
    /tabBarAccessibilityLabel:/,
    'a function label drops the librarys synthesized iOS tab announcement, so the navigator must restate it'
  );
  assert.match(
    source,
    /tabLabel:\s*\{\s*\.\.\.typography\.tabLabel,\s*fontSize: 11,\s*lineHeight: 14,\s*fontWeight: '600',\s*\}/,
    'tab labels should override the shared token down to the EL 11/14 size'
  );
});

test('TabNavigator collapses the tab bar for hidden nested routes in the More stack too', () => {
  const source = readRelativeSource('./TabNavigator.tsx');
  // LocalePreferences (the nation/Bible flow) carries its own pinned footer, so
  // the More stack must feed shouldHideTabBarOnNestedRoute like the other tabs.
  assert.match(
    source,
    /route\.name === 'Bible' \|\|\s*route\.name === 'Learn' \|\|\s*route\.name === 'Plans' \|\|\s*route\.name === 'More'/
  );
});
