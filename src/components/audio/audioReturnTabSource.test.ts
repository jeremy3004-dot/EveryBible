import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AudioReturnTab only appears for active playback away from BibleReader and uses the live chapter when audio advances', () => {
  const source = readRelativeSource('./AudioReturnTab.tsx');

  assert.match(
    source,
    /const hasActiveAudioRoute = status === 'playing';/,
    'AudioReturnTab should only render while audio is actively playing in the background'
  );

  assert.match(
    source,
    /currentRouteName === 'BibleReader'/,
    'AudioReturnTab should hide itself while the user is already on the Bible reader'
  );

  assert.match(
    source,
    /if \(!audioReturnTarget \|\| !hasActiveAudioRoute \|\| currentRouteName === 'BibleReader'\)/,
    'AudioReturnTab should require both an active playback target and an off-reader route before rendering'
  );

  assert.match(
    source,
    /const resolvedBookId = currentBookId \?\? audioReturnTarget\?\.bookId \?\? null;/,
    'AudioReturnTab should prefer the live audio book over the saved return-target book'
  );

  assert.match(
    source,
    /const resolvedChapter = currentChapter \?\? audioReturnTarget\?\.chapter \?\? null;/,
    'AudioReturnTab should prefer the live audio chapter over the saved return-target chapter'
  );
});

test('AudioReturnTab returns to BibleReader with the saved plan-session context intact', () => {
  const source = readRelativeSource('./AudioReturnTab.tsx');

  assert.match(
    source,
    /rootNavigationRef\.navigate\('Bible',\s*\{[\s\S]*screen:\s*'BibleReader'/,
    'AudioReturnTab should route back through the shared BibleReader screen'
  );

  assert.match(
    source,
    /preferredMode:\s*target\.preferredMode/,
    'AudioReturnTab should restore whichever reader mode the user left'
  );

  assert.match(
    source,
    /target\.planId[\s\S]*target\.planDayNumber[\s\S]*target\.planSessionKey[\s\S]*target\.returnToPlanOnComplete[\s\S]*target\.sessionContext/s,
    'AudioReturnTab should preserve plan and rhythm session params when returning to active audio'
  );
});

test('AudioReturnTab looks like a slim right-edge tab instead of a full mini-player card', () => {
  const source = readRelativeSource('./AudioReturnTab.tsx');

  assert.match(
    source,
    /right:\s*-59/,
    'AudioReturnTab should sit flush against the right edge of the screen'
  );

  assert.match(
    source,
    /transform:\s*\[\{\s*rotate:\s*'-90deg'\s*}\]/,
    'AudioReturnTab should rotate into a vertical edge-tab treatment'
  );

  assert.match(
    source,
    /height:\s*30/,
    'AudioReturnTab should keep a thinner tab profile than the old mini-player card treatment'
  );

  assert.match(
    source,
    /borderColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.78\)'/,
    'AudioReturnTab should use a subtle white accent line to define the tab edge'
  );

  assert.match(
    source,
    /borderTopWidth:\s*1[\s\S]*borderLeftWidth:\s*1[\s\S]*borderRightWidth:\s*1[\s\S]*borderBottomWidth:\s*0/s,
    'AudioReturnTab should leave the screen-edge side unlined while outlining the inward and exposed edges'
  );
});
