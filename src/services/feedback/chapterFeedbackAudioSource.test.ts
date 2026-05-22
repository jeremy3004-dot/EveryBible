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

test('chapter feedback audio upload keeps anonymous responses on the Edge Function path', () => {
  const source = readFileSync(AUDIO_SERVICE_PATH, 'utf8');

  assert.doesNotMatch(
    source,
    /Please sign in before sending an audio response/,
    'anonymous audio feedback should not be blocked by the mobile upload helper'
  );
  assert.match(
    source,
    /base64Data/,
    'anonymous audio feedback should send encoded upload data to the Edge Function'
  );
  assert.match(
    source,
    /path:\s*null/,
    'anonymous audio feedback should let the Edge Function assign the private storage path'
  );
});
