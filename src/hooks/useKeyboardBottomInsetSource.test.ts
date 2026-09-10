import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useKeyboardBottomInset tracks the keyboard frame on both platforms', () => {
  const source = readRelativeSource('./useKeyboardBottomInset.ts');

  assert.match(
    source,
    /import \{ Keyboard, Platform, type KeyboardEvent \} from 'react-native';/,
    'useKeyboardBottomInset should use the built-in Keyboard API — no new native keyboard dependency in the managed workflow'
  );

  assert.match(
    source,
    /isIOS \? 'keyboardWillShow' : 'keyboardDidShow'/,
    'iOS should keep using keyboardWillShow so the inset lands before the keyboard finishes animating, while Android only reports the keyboard once it is up'
  );

  assert.match(
    source,
    /isIOS \? 'keyboardWillHide' : 'keyboardDidHide'/,
    'both platforms should reset the inset when the keyboard hides'
  );

  assert.match(
    source,
    /platform: 'ios',[\s\S]*?keyboardHeight: event\.endCoordinates\.height/,
    'the iOS branch should stay on the reported keyboard height so its behavior is unchanged'
  );

  assert.match(
    source,
    /surface\.measureInWindow\(\(_x, y, _width, height\) => \{/,
    'Android should measure the surface itself instead of guessing from screen math — edge-to-edge clears decorFitsSystemWindows, so adjustResize may never shrink the window'
  );

  assert.match(
    source,
    /surfaceBottomY: y \+ height,[\s\S]*?safeAreaBottomInset: safeAreaBottomInsetRef\.current,/,
    'the Android overlap should come from the measured surface bottom'
  );

  assert.match(
    source,
    /keyboardTopY: event\.endCoordinates\.screenY/,
    'the keyboard top edge should come from the event end coordinates'
  );

  assert.match(
    source,
    /const surface = surfaceRefRef\.current\?\.current;\s*if \(!surface\) \{\s*setBottomInset\(0\);/,
    'a consumer that passes no surface should keep the old Android behavior of reporting 0 rather than guessing'
  );

  assert.match(
    source,
    /showSubscription\.remove\(\);[\s\S]*hideSubscription\.remove\(\);/,
    'useKeyboardBottomInset should remove both keyboard listeners on unmount'
  );

  assert.doesNotMatch(
    source,
    /useEffect\([\s\S]*?\}, \[[^\]]+\]\);/,
    'the keyboard subscriptions should never be torn down and re-added mid-animation — changing inputs are read through refs'
  );
});
