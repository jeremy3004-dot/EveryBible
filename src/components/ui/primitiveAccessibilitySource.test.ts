import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source-text assertions, matching tabSwitchSource.test.ts: these primitives all
// import react-native, which the node test runner cannot parse, so the contract
// is pinned against the source instead of a render.
function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('SectionHeader titles are headings the rotor can jump between', () => {
  const source = readRelativeSource('./SectionHeader.tsx');

  assert.match(
    source,
    /accessibilityRole="header"/,
    'the section title is the only heading on screens that run headerShown:false'
  );
  assert.match(
    source,
    /numberOfLines=\{2\}/,
    'the row is laid out by content, so a translated title should wrap rather than truncate'
  );
});

test('EmptyState names its heading and hides its decorative icon', () => {
  const source = readRelativeSource('./EmptyState.tsx');

  assert.match(source, /accessibilityRole="header"/, 'the empty-state title is a heading');
  assert.match(
    source,
    /accessible=\{false\}\s*\n\s*importantForAccessibility="no-hide-descendants"/,
    'the icon repeats the title, so it must not be a focus stop on either platform'
  );
});

test('AppCard pairs its label with accessible so the label is not dropped', () => {
  const source = readRelativeSource('./AppCard.tsx');

  assert.match(
    source,
    /accessible=\{accessibilityLabel \? true : undefined\}\s*\n\s*accessibilityLabel=\{accessibilityLabel\}/,
    'a bare View ignores accessibilityLabel unless it is also an accessibility element'
  );
});

test('ListRow announces everything it renders and keeps its disabled state honest', () => {
  const source = readRelativeSource('./ListRow.tsx');

  assert.match(
    source,
    /\[title, value, subtitle\]\.filter\(Boolean\)\.join\(', '\)/,
    'the default label must include the value and subtitle, not just the title'
  );
  assert.match(
    source,
    /accessible=\{accessible\}/,
    'a row whose trailing Switch must stay its own focus stop needs to pass accessible={false}'
  );
  assert.match(
    source,
    /accessibilityState=\{\{ disabled \}\}/,
    'disabled must be announced, not only rendered as dimming'
  );
  assert.match(source, /hitSlop=\{ROW_HIT_SLOP\}/, 'the separator gap between rows is dead space');
  assert.match(source, /const ROW_HIT_SLOP = 8;/, 'the row hit slop is a named constant');

  // Settings relies on these three: the value column stays one line, the text
  // column flexes, and the row height floor is unchanged by the a11y pass.
  assert.match(source, /const ROW_MIN_HEIGHT = 52;/, 'the row recipe keeps its 52pt floor');
  assert.match(source, /textColumn: \{\s*\n?\s*flex: 1/, 'the text column still flexes');
});

test('Sheet is a named modal that survives Android edge-to-edge', () => {
  const source = readRelativeSource('./Sheet.tsx');

  assert.match(
    source,
    /accessibilityViewIsModal=\{Platform\.OS === 'ios'\}/,
    'VoiceOver must be scoped to the sheet rather than wandering behind it'
  );
  assert.match(
    source,
    /closeLabel \?\? t\('interface\.close'\)/,
    'the dismiss backdrop defaults to the translated Close (interface.close; common.close does not exist)'
  );
  assert.match(
    source,
    /statusBarTranslucent\s*\n\s*navigationBarTranslucent/,
    'both bars must be translucent or the sheet floats above the Android gesture bar'
  );
  assert.match(
    source,
    /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/,
    'edge-to-edge makes the window adjustResize inert, so Android needs a real behavior'
  );
});

test('ProgressBar and Avatar can be named, and an unnamed Avatar is decorative', () => {
  const progress = readRelativeSource('./ProgressBar.tsx');
  assert.match(
    progress,
    /accessibilityRole="progressbar"\s*\n\s*accessibilityLabel=\{accessibilityLabel\}/,
    'a standalone bar otherwise announces a bare percentage'
  );

  const avatar = readRelativeSource('./Avatar.tsx');
  assert.match(
    avatar,
    /const label = accessibilityLabel \?\? name;/,
    'the avatar falls back to the name it already renders'
  );
  assert.match(
    avatar,
    /accessible: false, importantForAccessibility: 'no-hide-descendants'/,
    'an unlabelled avatar must be decorative, not an unnamed focus stop'
  );
  assert.match(
    avatar,
    /<Text\s*\n\s*accessible=\{false\}/,
    'the initials are the picture; the container carries the whole label'
  );
});

test('AppButton labels wrap and stop scaling before they eat the screen', () => {
  const source = readRelativeSource('./AppButton.tsx');

  assert.match(source, /const LABEL_MAX_FONT_SCALE = 1\.6;/, 'the Dynamic Type cap is named');
  assert.match(
    source,
    /numberOfLines=\{2\}\s*\n\s*maxFontSizeMultiplier=\{LABEL_MAX_FONT_SCALE\}/,
    'a long translated label wraps instead of being truncated'
  );
  assert.match(
    source,
    /\{ minHeight: height,/,
    'the pill must be min-height, or a wrapped label is clipped rather than growing it'
  );
});

test('PressableScale types itself as a button when it takes a press', () => {
  const source = readRelativeSource('./PressableScale.tsx');

  assert.match(
    source,
    /accessibilityRole=\{accessibilityRole \?\? \(onPress \? 'button' : undefined\)\}/,
    'a new call site should not be able to ship an untyped tappable control'
  );
});

test('TabSwitch requires a name and reclaims the 44pt touch floor as slop', () => {
  const source = readRelativeSource('./TabSwitch.tsx');

  assert.match(
    source,
    /accessibilityLabel: string;/,
    'the tablist label is required — all six call sites already pass one'
  );
  assert.doesNotMatch(
    source,
    /accessibilityLabel\?: string;/,
    'the label must not slip back to optional'
  );
  assert.match(
    source,
    /layout\.minTouchTarget - SIZE_HEIGHT\[size\]/,
    'the small track is ~24pt tall, so the shortfall is taken as hit slop like IconButton'
  );
  assert.match(source, /hitSlop=\{segmentHitSlop\}/, 'each segment carries the computed slop');
});
