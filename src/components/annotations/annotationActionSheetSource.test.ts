import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AnnotationActionSheet intercepts the Android hardware back button to close the sheet instead of falling through to the reader', () => {
  const source = readRelativeSource('./AnnotationActionSheet.tsx');

  assert.match(
    source,
    /import \{[\s\S]*BackHandler[\s\S]*\} from 'react-native';/,
    'AnnotationActionSheet should import BackHandler from react-native'
  );

  assert.match(
    source,
    /BackHandler\.addEventListener\('hardwareBackPress',/,
    'AnnotationActionSheet should register a hardwareBackPress handler while the sheet is visible'
  );

  assert.match(
    source,
    /return \(\) => subscription\.remove\(\);/,
    'The hardware back handler should clean up with .remove(), not the removed removeEventListener API'
  );

  assert.equal(
    source.includes('BackHandler.removeEventListener'),
    false,
    'AnnotationActionSheet should not use the deprecated/removed BackHandler.removeEventListener API'
  );

  assert.equal(
    source.includes('<Modal'),
    false,
    'AnnotationActionSheet should remain inline (no Modal) so the Bible stays tappable while verses are selected'
  );
});
