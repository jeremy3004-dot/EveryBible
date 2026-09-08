import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('TabSwitch exposes the platform tab semantics screen readers need', () => {
  const source = readRelativeSource('./TabSwitch.tsx');

  assert.match(
    source,
    /<View\s+accessibilityRole="tablist"/,
    'the track must announce itself as a tablist so the segments read as one control'
  );

  assert.match(
    source,
    /accessibilityRole="tablist"\s*\n\s*accessibilityLabel=\{accessibilityLabel\}/,
    'the tablist must carry the caller-supplied label so the control is named, not just typed'
  );

  assert.match(
    source,
    /<Pressable[\s\S]{0,200}accessibilityRole="tab"/,
    'each segment must announce itself as a tab'
  );

  assert.match(
    source,
    /accessibilityRole="tab"\s*\n\s*accessibilityState=\{\{ selected \}\}/,
    'each segment must publish its selected state, or VoiceOver cannot tell which tab is active'
  );

  assert.match(
    source,
    /accessibilityLabel=\{segment\.label\}/,
    'each segment must be labelled with its own translated label'
  );
});

test('TabSwitch honours the reduce-motion setting when the thumb slides', () => {
  const source = readRelativeSource('./TabSwitch.tsx');

  assert.match(
    source,
    /import Animated, \{[\s\S]*useReducedMotion,[\s\S]*\} from 'react-native-reanimated';/,
    'TabSwitch should read the reduce-motion setting from reanimated'
  );

  assert.match(
    source,
    /const reduceMotion = useReducedMotion\(\);/,
    'TabSwitch should capture the reduce-motion preference in the component body'
  );

  assert.match(
    source,
    /const duration = reduceMotion \? 0 : motion\.duration\.base;/,
    'the thumb transition must collapse to zero duration when the user asks for reduced motion'
  );

  assert.match(
    source,
    /\[measured, offset, reduceMotion, thumbWidth\]/,
    'the animated style must re-evaluate when the reduce-motion preference changes'
  );
});

test('TabSwitch takes every colour from the theme rather than hardcoding hex literals', () => {
  const source = readRelativeSource('./TabSwitch.tsx');

  assert.match(
    source,
    /const \{ colors \} = useTheme\(\);/,
    'TabSwitch should resolve its palette through the theme context'
  );

  assert.match(
    source,
    /backgroundColor: colors\.muted, borderColor: colors\.borderStrong/,
    'the inset track should use the muted fill and strong border tokens'
  );

  assert.match(
    source,
    /backgroundColor: colors\.cardBackground,\s*\n\s*borderColor: colors\.cardBorder,/,
    'the sliding thumb should read as lit paper from the card tokens'
  );

  assert.match(
    source,
    /color: selected \? colors\.primaryText : colors\.secondaryText,/,
    'segment labels should switch between the primary and secondary text tokens'
  );

  assert.equal(
    /#[0-9a-fA-F]{3,8}\b/.test(source),
    false,
    'TabSwitch must not hardcode hex colours — the control has to follow both scopes'
  );

  assert.equal(
    /rgba?\(/.test(source),
    false,
    'TabSwitch must not hardcode rgb/rgba colours either'
  );
});
