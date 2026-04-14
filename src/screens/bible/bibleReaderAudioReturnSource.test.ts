import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen syncs a shared audio return target from the active reader context', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const setAudioReturnTarget = useAudioStore\(\(state\) => state\.setAudioReturnTarget\);/,
    'BibleReaderScreen should subscribe to the shared audio return-target setter'
  );

  assert.match(
    source,
    /const resolvedBookId = activeAudioBookId \?\? bookId;[\s\S]*const resolvedChapter = activeAudioChapter \?\? chapter;/s,
    'BibleReaderScreen should derive the return target from the live audio chapter when it drifts from the routed chapter'
  );

  assert.match(
    source,
    /setAudioReturnTarget\(\{[\s\S]*preferredMode:\s*chapterSessionMode,[\s\S]*\.\.\.resolvePlanSessionRouteParams\(resolvedBookId, resolvedChapter\),[\s\S]*\}\);/s,
    'BibleReaderScreen should preserve the current reader mode and plan-session route params in the audio return target'
  );
});
