import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const AUDIO_SERVICE_PATH = path.join(REPO_ROOT, 'src/services/feedback/chapterFeedbackAudio.ts');

test('chapter feedback audio upload uses the Expo FileSystem legacy API for SDK 54 helpers', () => {
  const source = readFileSync(AUDIO_SERVICE_PATH, 'utf8');

  assert.match(
    source,
    /from 'expo-file-system\/legacy'/,
    'uploadChapterFeedbackAudio should import legacy FileSystem helpers while using getInfoAsync/readAsStringAsync'
  );
  assert.doesNotMatch(
    source,
    /from 'expo-file-system';/,
    'SDK 54 top-level expo-file-system throws for deprecated getInfoAsync/readAsStringAsync calls'
  );
});
