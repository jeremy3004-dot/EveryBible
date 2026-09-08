import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('LessonDetailScreen uses the active Bible translation for gather scripture and audio', () => {
  const source = readRelativeSource('./LessonDetailScreen.tsx');

  assert.equal(
    source.includes('useBibleStore'),
    true,
    'LessonDetailScreen should read the current Bible translation from the shared Bible store'
  );

  assert.equal(
    source.includes(
      'getPassageText(lesson.references, currentTranslation, { bookNameResolver: resolveBookName })'
    ),
    true,
    'LessonDetailScreen should load gather passage text in the currently selected translation and locale'
  );

  assert.equal(
    source.includes(
      'getChapterAudioUrl(currentTranslation, primaryRef.bookId, primaryRef.chapter)'
    ),
    true,
    'LessonDetailScreen should resolve gather lesson audio from the currently selected translation when available'
  );

  assert.equal(
    source.includes('gather.readTheStory'),
    false,
    'LessonDetailScreen should not render the redundant "Read the Story" button'
  );

  assert.equal(
    source.includes('share-outline'),
    false,
    'LessonDetailScreen should not keep the broken top-right header share button'
  );
});

// The Every Language redesign replaced the two-row transport bar with a single
// floating paper capsule and moved playback speed / text size into the header
// sheet. These assertions lock that shape in.
test('LessonDetailScreen renders the EL lesson chrome', () => {
  const source = readRelativeSource('./LessonDetailScreen.tsx');

  assert.equal(
    source.includes('@expo/vector-icons'),
    false,
    'LessonDetailScreen should render Lucide glyphs, not Ionicons'
  );

  assert.match(
    source,
    /from 'lucide-react-native'/,
    'LessonDetailScreen should import its glyphs from lucide-react-native'
  );

  for (const primitive of ['AppCard', 'IconButton', 'ProgressBar', 'Sheet', 'TabSwitch']) {
    assert.equal(
      source.includes(primitive),
      true,
      `LessonDetailScreen should compose the shared ${primitive} primitive instead of a bespoke one`
    );
  }

  assert.match(
    source,
    /typography\.numeralHero/,
    'the lesson hero leads with the display numeral for the lesson ordinal'
  );

  assert.match(
    source,
    /shadows\.floating/,
    'the listen capsule floats over the page and carries the floating shadow'
  );

  assert.equal(
    source.includes('styles.tabPill'),
    false,
    'the section tab pills are replaced by the shared TabSwitch'
  );
});

test('LessonDetailScreen keeps every lesson behaviour the redesign inherited', () => {
  const source = readRelativeSource('./LessonDetailScreen.tsx');

  // Audio transport.
  assert.match(source, /togglePlayPause/, 'play/pause must stay wired to the capsule control');
  assert.match(source, /setRateAsync/, 'playback speed must still reach the loaded sound');
  assert.match(
    source,
    /setPositionAsync/,
    'seeking must survive the loss of the ±10s arrows — the progress rule scrubs'
  );

  // Completion.
  assert.match(source, /markLessonComplete/, 'the capsule must still mark the lesson complete');
  assert.match(source, /unmarkLessonComplete/, 'completion must stay a toggle');
  assert.match(
    source,
    /colors\.successSoft/,
    'the completed pill fills with the success-soft token'
  );

  // Section navigation and reading preferences.
  assert.match(source, /scrollToSection/, 'the section switch must still drive the scroll');
  assert.match(source, /useFontSize/, 'the lesson text size must seed from the global preference');
  assert.match(
    source,
    /getReadingFontFamily/,
    'the passage must fall back to the platform serif for non-Latin scripts'
  );
});
