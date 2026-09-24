// Startup import-graph guard (not a behaviour test): Home is the first screen, so
// sharing and Bible database modules must load lazily and the heavy barrels must
// stay off its import graph. What Home renders and shares is covered by
// HomeScreen.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen keeps sharing, the Bible database and broad barrels off its startup path', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes("import * as Sharing from 'expo-sharing';"),
    false,
    'HomeScreen should not eagerly import expo-sharing on the startup path'
  );

  assert.equal(
    source.includes("from '../../stores';"),
    false,
    'HomeScreen should avoid the stores barrel on the startup path'
  );

  assert.equal(
    source.includes("from '../../services/bible';"),
    false,
    'HomeScreen should avoid the bible barrel because it evaluates reader/download modules before the first screen'
  );

  assert.equal(
    source.includes("from '../../services/audio';"),
    false,
    'HomeScreen should avoid the audio barrel because it evaluates playback/download modules before the first screen'
  );

  assert.match(
    source,
    /loadBibleService: \(\) => import\('\.\.\/\.\.\/services\/bible\/bibleService'\)/,
    'HomeScreen should lazy-load Bible database access after interactions when loading verse-of-day text'
  );

  assert.match(
    source,
    /import \{ useBibleStore \} from '\.\.\/\.\.\/stores\/bibleStore';/,
    'HomeScreen should import the bible store directly on the startup path'
  );

  assert.match(
    source,
    /const Sharing = await import\('expo-sharing'\);/,
    'HomeScreen should lazy-load Expo Sharing only when the share button is pressed'
  );

  assert.match(
    source,
    /const \{ captureRef \} = await import\('react-native-view-shot'\);/,
    'HomeScreen should lazy-load react-native-view-shot only when the share button is pressed'
  );
});
