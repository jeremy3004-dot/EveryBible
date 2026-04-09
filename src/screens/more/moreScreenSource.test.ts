import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('More tab stays focused on profile and settings instead of a saved library hub', () => {
  const moreScreenSource = readRelativeSource('./MoreScreen.tsx');
  const moreStackSource = readRelativeSource('../../navigation/MoreStack.tsx');
  const navTypesSource = readRelativeSource('../../navigation/types.ts');

  assert.equal(
    moreScreenSource.includes("title: 'Saved Library'"),
    false,
    'MoreScreen should not list a Saved Library destination in the More tab menu'
  );

  assert.equal(
    moreStackSource.includes('name="Library"'),
    false,
    'MoreStack should not register a dedicated Library screen once the More tab is settings-focused again'
  );

  assert.equal(
    navTypesSource.includes('Library: undefined;'),
    false,
    'navigation types should drop the Library route from MoreStackParamList'
  );
});

test('guest CTAs open the shared auth flow instead of directly navigating to a split auth screen', () => {
  const moreScreenSource = readRelativeSource('./MoreScreen.tsx');
  const profileScreenSource = readRelativeSource('./ProfileScreen.tsx');

  assert.match(
    moreScreenSource,
    /openAuthFlow\('signIn'\)/,
    'MoreScreen should open the shared auth flow in sign-in mode for guest users'
  );

  assert.match(
    profileScreenSource,
    /openAuthFlow\('signIn'\)/,
    'ProfileScreen should open the shared auth flow in sign-in mode for guest users'
  );

  assert.equal(
    moreScreenSource.includes("navigation.navigate('Auth')"),
    false,
    'MoreScreen should not directly navigate to the old auth route contract'
  );

  assert.equal(
    profileScreenSource.includes("navigation.navigate('Auth')"),
    false,
    'ProfileScreen should not directly navigate to the old auth route contract'
  );
});

test('Bible reader no longer exposes a saved library action after removing the More tab library hub', () => {
  const readerSource = readRelativeSource('../bible/BibleReaderScreen.tsx');

  assert.equal(
    readerSource.includes('handleOpenLibrary'),
    false,
    'BibleReaderScreen should remove the saved library navigation handler'
  );

  assert.equal(
    readerSource.includes('Open saved library'),
    false,
    'BibleReaderScreen should not offer an Open saved library action in the chapter actions sheet'
  );
});
