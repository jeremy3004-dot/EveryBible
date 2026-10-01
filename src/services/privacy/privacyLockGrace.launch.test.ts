import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * privacyLockGrace keeps module state for the whole app session, so the state it starts
 * with needs a file of its own: every other test has already moved it on.
 */
test('the first app switcher after launch is neither an icon alert nor excused by a grace', async () => {
  const grace = await import('./privacyLockGrace');

  grace.notePrivacyLockAppState('inactive');

  // usePrivacyLock locks an inactive app unless one of these excuses it; either one here
  // would leave scripture in the app-switcher snapshot.
  assert.deepEqual(
    {
      underIconAlert: grace.isInactiveUnderIconAlert(),
      graceDeadline: grace.getPrivacyLockGraceDeadline(),
    },
    { underIconAlert: false, graceDeadline: null }
  );
});
