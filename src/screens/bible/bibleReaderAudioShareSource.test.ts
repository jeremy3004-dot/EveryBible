import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen wires full-chapter audio sharing and a portion trim flow from the listen page', () => {
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
    /const handleShareFullChapterAudio = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated full-chapter audio share handler'
  );

  assert.match(
    source,
    /const handleShareAudioPortion = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated clip-share handler for trimmed audio portions'
  );

  assert.match(
    source,
    /InteractionManager\.runAfterInteractions/,
    'BibleReaderScreen should let the modal dismiss before starting the native share or trim flow'
  );

  assert.match(
    source,
    /setPendingChapterAudioShareAction\('full'\)/,
    'BibleReaderScreen should immediately show a preparing state when full-audio sharing starts'
  );

  assert.match(
    source,
    /setPendingChapterAudioShareAction\('portion'\)/,
    'BibleReaderScreen should immediately show a preparing state when clip sharing starts'
  );

  assert.match(
    source,
    /finally \{\s*setPendingChapterAudioShareAction\(null\);/s,
    'BibleReaderScreen should clear the preparing state after the full-audio share flow finishes or fails'
  );

  assert.match(
    source,
    /await prepareChapterAudioShareAsset\(/,
    'BibleReaderScreen should prepare a real audio file before launching the share sheet or trim editor'
  );

  assert.match(
    source,
    /const Sharing = await import\('expo-sharing'\);/,
    'BibleReaderScreen should lazy-load Expo Sharing when the audio share action is invoked'
  );

  assert.match(
    source,
    /const \{\s*showEditor,\s*isValidFile,\s*default:\s*NativeVideoTrim,\s*\} = await import\('react-native-video-trim'\);/s,
    'BibleReaderScreen should lazy-load the native trim editor, its validator, and the native module only when clip sharing is requested'
  );

  assert.match(
    source,
    /const isValidAudioFile = await isValidFile\(audioShareAsset\.uri\);/,
    'BibleReaderScreen should validate the prepared audio file before opening the trim editor'
  );

  assert.match(
    source,
    /NativeEventEmitter,\s*NativeModules,/s,
    'BibleReaderScreen should import native event helpers so the trim handoff works on the app’s old-architecture runtime'
  );

  assert.match(
    source,
    /const isFabricRuntime = Boolean\(\(globalThis as \{ nativeFabricUIManager\?: unknown \}\)\.nativeFabricUIManager\);/,
    'BibleReaderScreen should detect whether the trim module is running through the new or old architecture before wiring listeners'
  );

  assert.match(
    source,
    /NativeVideoTrim\.onShow\(\(\) => \{\s*handleTrimEditorShown\(\);/s,
    'BibleReaderScreen should keep the loading state until the new-architecture trim editor actually appears'
  );

  assert.match(
    source,
    /trimEventEmitter\.addListener\(\s*'VideoTrim',/s,
    'BibleReaderScreen should also listen for trim lifecycle events through NativeEventEmitter on the old architecture'
  );

  assert.match(
    source,
    /case 'onShow':\s*handleTrimEditorShown\(\);/s,
    'BibleReaderScreen should clear the preparing state only after the old-architecture trim editor reports that it is shown'
  );

  assert.match(
    source,
    /type:\s*'audio'/,
    'BibleReaderScreen should open the trim editor in audio mode for chapter clips'
  );

  assert.match(
    source,
    /openShareSheetOnFinish:\s*true/,
    'BibleReaderScreen should let the trim editor hand the finished audio clip directly into the system share sheet'
  );

  assert.match(
    source,
    /detail:\s*'share-audio-full'/,
    'BibleReaderScreen should track analytics when users share a full chapter audio file'
  );

  assert.match(
    source,
    /detail:\s*'share-audio-clip'/,
    'BibleReaderScreen should track analytics when users share a trimmed chapter clip'
  );

  assert.match(
    source,
    /onShare=\{\(\) => \{\s*setShowChapterAudioShareSheet\(true\);/,
    'BibleReaderScreen should pass the share-sheet opener into the audio-first chapter card'
  );

  assert.match(
    source,
    /visible=\{showChapterAudioShareSheet\}/,
    'BibleReaderScreen should render a dedicated modal for the audio share choices'
  );

  assert.match(
    source,
    /visible=\{pendingChapterAudioShareAction !== null\}/,
    'BibleReaderScreen should render a visible loading modal while audio share assets are being prepared'
  );

  assert.match(
    source,
    /t\('bible\.shareChapterAudio'\)/,
    'BibleReaderScreen should expose a translated full-chapter audio share label'
  );

  assert.match(
    source,
    /t\('bible\.shareAudioPortion'\)/,
    'BibleReaderScreen should expose a translated clip-share label'
  );
});
