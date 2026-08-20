import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useKeyboardBottomInset tracks the iOS keyboard frame and stays inert on Android', () => {
  const source = readRelativeSource('./useKeyboardBottomInset.ts');

  assert.match(
    source,
    /import \{ Keyboard, Platform \} from 'react-native';/,
    'useKeyboardBottomInset should use the built-in Keyboard API — no new native keyboard dependency in the managed workflow'
  );

  assert.match(
    source,
    /Platform\.OS !== 'ios'/,
    "useKeyboardBottomInset should return 0 on Android, where softwareKeyboardLayoutMode=resize already shrinks the window and extra padding would double-compensate"
  );

  assert.match(
    source,
    /keyboardWillShow/,
    'useKeyboardBottomInset should listen to keyboardWillShow on iOS so the inset lands before the keyboard finishes animating'
  );

  assert.match(
    source,
    /keyboardWillHide/,
    'useKeyboardBottomInset should reset the inset when the keyboard hides'
  );

  assert.match(
    source,
    /endCoordinates\.height/,
    'useKeyboardBottomInset should read the keyboard height from the event end coordinates'
  );

  assert.match(
    source,
    /showSubscription\.remove\(\);[\s\S]*hideSubscription\.remove\(\);/,
    'useKeyboardBottomInset should remove both keyboard listeners on unmount'
  );
});
