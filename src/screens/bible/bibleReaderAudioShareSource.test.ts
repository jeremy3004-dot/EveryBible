import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen wires full-chapter sharing and an in-app audio-portion range picker', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const \[showChapterAudioShareSheet, setShowChapterAudioShareSheet\] = useState\(false\);/,
    'BibleReaderScreen should keep dedicated state for the listen-page audio share sheet'
  );

  assert.match(
    source,
    /const \[pendingChapterAudioShareAction, setPendingChapterAudioShareAction\] = useState<[\s\S]*'full' \| 'portion' \| null[\s\S]*>\(null\);/s,
    'BibleReaderScreen should track when an audio share action is preparing so the UI can give immediate feedback'
  );

  assert.match(
    source,
    /const \[audioPortionShareDraft, setAudioPortionShareDraft\] = useState<AudioPortionShareDraft \| null>\(\s*null\s*\);/s,
    'BibleReaderScreen should keep draft state for in-app audio portion selection'
  );

  assert.match(
    source,
    /import VideoTrimModule,\s*\{\s*isValidFile as isValidTrimMediaFile,\s*trim as trimAudioMedia,\s*\}\s*from 'react-native-video-trim';/s,
    'BibleReaderScreen should import the trim function for headless audio clipping instead of opening the native editor UI'
  );

  assert.match(
    source,
    /const handleShareFullChapterAudio = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated full-chapter audio share handler'
  );

  assert.match(
    source,
    /const handleShareAudioPortion = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated portion-share handler'
  );

  assert.match(
    source,
    /const handleConfirmAudioPortionShare = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated confirmation handler to trim and share the selected audio portion'
  );

  assert.match(
    source,
    /InteractionManager\.runAfterInteractions/,
    'BibleReaderScreen should let the share-choice modal dismiss before preparing audio assets'
  );

  assert.match(
    source,
    /setPendingChapterAudioShareAction\('full'\)/,
    'BibleReaderScreen should immediately show a preparing state when full-audio sharing starts'
  );

  assert.match(
    source,
    /setPendingChapterAudioShareAction\('portion'\)/,
    'BibleReaderScreen should immediately show a preparing state when portion sharing starts'
  );

  assert.match(
    source,
    /await prepareChapterAudioShareAsset\(/,
    'BibleReaderScreen should prepare a real audio file before launching chapter sharing or portion selection'
  );

  assert.match(
    source,
    /const validateTrimMediaFile =/,
    'BibleReaderScreen should resolve a trim validator defensively before opening the portion picker'
  );

  assert.match(
    source,
    /setAudioPortionShareDraft\(\{\s*sourceUri:\s*audioShareAsset\.uri,/s,
    'BibleReaderScreen should open the in-app portion picker with a prepared audio draft'
  );

  assert.match(
    source,
    /visible=\{audioPortionShareDraft !== null\}/,
    'BibleReaderScreen should render a dedicated modal for in-app audio portion range selection'
  );

  assert.match(
    source,
    /function AudioRangeSelector\(/,
    'BibleReaderScreen should define a dedicated single-track waveform selector for audio portions'
  );

  assert.match(
    source,
    /PanResponder\.create\(/,
    'BibleReaderScreen should make both range handles draggable in the in-app selector'
  );

  assert.match(
    source,
    /<AudioRangeSelector[\s\S]*startMs=\{audioPortionStartMs\}[\s\S]*endMs=\{audioPortionEndMs\}[\s\S]*onStartChange=\{handleAudioPortionStartSeek\}[\s\S]*onEndChange=\{handleAudioPortionEndSeek\}/s,
    'BibleReaderScreen should bind the in-app waveform selector to the current start/end share range'
  );

  assert.match(
    source,
    /await trimMediaFile\(audioPortionShareDraft\.sourceUri,\s*\{/s,
    'BibleReaderScreen should trim the selected range with a headless audio trim call'
  );

  assert.match(
    source,
    /startTime,\s*endTime,/s,
    'BibleReaderScreen should pass the user-selected start and end times into the trim operation'
  );

  assert.match(
    source,
    /const trimOutputUri = trimOutputPath\.startsWith\('file:\/\/'\)\s*\?\s*trimOutputPath\s*:\s*`file:\/\/\$\{trimOutputPath\}`;/s,
    'BibleReaderScreen should normalize trimmed output paths into file URIs before sharing'
  );

  assert.match(
    source,
    /await Sharing\.shareAsync\(trimOutputUri,/,
    'BibleReaderScreen should open the native share sheet with the trimmed audio file'
  );

  assert.doesNotMatch(
    source,
    /showEditor\(/,
    'BibleReaderScreen should avoid opening the native trim editor UI for audio portions'
  );
});
