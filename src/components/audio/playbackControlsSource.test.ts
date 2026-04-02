import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('PlaybackControls supports a chapter-only transport variant without 10-second skip buttons', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /variant\?: 'default' \| 'chapter-only'/,
    'PlaybackControls should expose a chapter-only variant for simplified Bible listen layouts'
  );

  assert.match(
    source,
    /const showSkipControls = variant === 'default';/,
    'PlaybackControls should derive skip-button visibility from the selected variant'
  );

  assert.match(
    source,
    /\{showSkipControls \? \(\s*<TouchableOpacity[\s\S]*styles\.skipButton/s,
    'PlaybackControls should only render the 10-second skip buttons when the default variant is active'
  );
});

test('PlaybackControls exposes a repeat utility button alongside playback speed controls', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /repeatMode: RepeatMode;/,
    'PlaybackControls should accept repeat mode from the shared audio player state'
  );

  assert.match(
    source,
    /onCycleRepeatMode: \(\) => void;/,
    'PlaybackControls should let listen surfaces cycle the repeat mode from a shared utility button'
  );

  assert.match(
    source,
    /<TouchableOpacity[\s\S]*onPress=\{\(\) => onCycleRepeatMode\(\)\}[\s\S]*renderRepeatModeIcon/s,
    'PlaybackControls should render a repeat button in the utility row'
  );
});

test('PlaybackControls supports icon-only text and share utilities for the chapter-only player', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /onShowText\?: \(\) => void;/,
    'PlaybackControls should accept an inline show-text action for listen mode'
  );

  assert.match(
    source,
    /showTextLabel\?: string;/,
    'PlaybackControls should let the listen surface provide the show-text label'
  );

  assert.match(
    source,
    /const showTextUtility = typeof onShowText === 'function';/,
    'PlaybackControls should derive whether to render the inline text utility from the provided callback'
  );

  assert.match(
    source,
    /showTextUtility \? \([\s\S]*accessibilityLabel=\{showTextLabel \?\? 'Show text'\}[\s\S]*renderTextUtilityIcon\(\)/s,
    'PlaybackControls should render the Dwell-inspired text utility as an icon-only button'
  );

  assert.match(
    source,
    /onShareAudio\?: \(\) => void;/,
    'PlaybackControls should accept a share callback for the chapter-only audio surface'
  );

  assert.match(
    source,
    /const showShareAudioUtility = typeof onShareAudio === 'function';/,
    'PlaybackControls should derive whether to render the share utility from the provided callback'
  );

  assert.match(
    source,
    /<View style=\{styles\.utilityPrimaryGroup\}>[\s\S]*renderTextUtilityIcon\(\)[\s\S]*share-outline[\s\S]*<\/View>/s,
    'PlaybackControls should keep the share button inside the same centered utility group as the other controls'
  );

  assert.match(
    source,
    /name="share-outline"/,
    'PlaybackControls should render the chapter-audio share utility as a single icon button'
  );

  assert.match(
    source,
    /accessibilityLabel=\{t\('bible\.shareChapterAudio'\)\}/,
    'PlaybackControls should label the chapter-audio share utility for assistive technology'
  );

  assert.equal(
    source.includes('shareUtilityButton'),
    false,
    'PlaybackControls should not keep a separate right-aligned share-button style once the control is centered with the other utilities'
  );
});

test('PlaybackControls lets the centered chapter-only utility cluster wrap on compact screens', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');
  const utilityGap = Number(
    (source.match(/utilityPrimaryGroup:\s*{[\s\S]*gap:\s*(\d+)/) ?? [])[1]
  );
  const baseUtilityWidth = Number(
    (source.match(/utilityButton:\s*{[\s\S]*minWidth:\s*(\d+)/) ?? [])[1]
  );
  const getVariantWidth = (styleName: string) =>
    Number((source.match(new RegExp(`${styleName}:\\s*{[\\s\\S]*minWidth:\\s*(\\d+)`)) ?? [])[1]);

  const totalMinimumWidth =
    baseUtilityWidth +
    getVariantWidth('musicUtilityButton') +
    getVariantWidth('repeatUtilityButton') +
    baseUtilityWidth +
    getVariantWidth('textUtilityButton') +
    getVariantWidth('iconOnlyUtilityButton') +
    utilityGap * 5;

  assert.ok(
    totalMinimumWidth > 320,
    'PlaybackControls compact-width regression test expects the six-button utility cluster to exceed a 320pt phone width before wrapping'
  );

  assert.match(
    source,
    /utilityPrimaryGroup:\s*{[\s\S]*flexWrap:\s*'wrap'/,
    'PlaybackControls should allow the centered chapter-only utility cluster to wrap onto a second row on compact screens'
  );

  assert.match(
    source,
    /utilityPrimaryGroup:\s*{[\s\S]*width:\s*'100%'/,
    'PlaybackControls should constrain the wrapping utility cluster to the available player width'
  );
});

test('PlaybackControls exposes a bundled background-music utility in the listen control row', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /backgroundMusicChoice: BackgroundMusicChoice;/,
    'PlaybackControls should receive the currently selected bundled background-music choice'
  );

  assert.match(
    source,
    /onChangeBackgroundMusicChoice: \(choice: BackgroundMusicChoice\) => void;/,
    'PlaybackControls should let listen surfaces update the selected bundled background-music choice'
  );

  assert.match(
    source,
    /musical-notes(?:-outline)?/,
    'PlaybackControls should render a music-note affordance for bundled background music'
  );

  assert.match(
    source,
    /setShowBackgroundMusicModal\(true\)/,
    'PlaybackControls should open a bundled background-music picker from the utility row'
  );
});

test('PlaybackControls gives the chapter-only transport a stronger Dwell-inspired hierarchy', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /const isChapterOnlyTransport = variant === 'chapter-only';/,
    'PlaybackControls should derive a dedicated transport treatment for the Bible listen player'
  );

  assert.match(
    source,
    /chapterOnlyTransportButton:\s*{[\s\S]*width:\s*52,[\s\S]*height:\s*52/s,
    'PlaybackControls should give chapter transport buttons a larger Dwell-inspired tap target'
  );

  assert.match(
    source,
    /chapterOnlyPlayButton:\s*{[\s\S]*width:\s*72,[\s\S]*height:\s*72/s,
    'PlaybackControls should make the main play button visually dominant in chapter-only mode'
  );
});

test('Bible listen surfaces opt into the chapter-only transport variant', () => {
  const audioFirstSource = readRelativeSource('./AudioFirstChapterCard.tsx');
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

  assert.match(
    audioFirstSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"/,
    'AudioFirstChapterCard should use the simplified chapter-only player transport'
  );

  assert.match(
    readerSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"/,
    'BibleReaderScreen listen mode should use the simplified chapter-only player transport'
  );

  assert.match(
    readerSource,
    /<PlaybackControls[\s\S]*onShowText=\{\(\) => setShowFollowAlongText\(true\)\}/,
    'BibleReaderScreen listen mode should pass the inline show-text action into PlaybackControls'
  );
});
