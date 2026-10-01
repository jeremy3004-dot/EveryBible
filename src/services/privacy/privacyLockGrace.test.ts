import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The lock that turning discreet mode on asks for is held back until iOS's icon-change
 * alert has been answered (`runAfterPrivacyIconAlert`). These tests drive the module the
 * way the app does: the privacy store expects an icon change, the preferences screen queues
 * its lock, the icon service says when no alert will come, and usePrivacyLock reports every
 * app state change. Locking too late leaves scripture on screen after discreet mode was
 * turned on; locking twice locks out a reader who has just unlocked.
 */

let grace: typeof import('./privacyLockGrace');
let CAP_MS: number;

before(async () => {
  grace = await import('./privacyLockGrace');
  CAP_MS = grace.PRIVACY_LOCK_GRACE_MAX_PENDING_MS;
});

// The module keeps its state across tests; each one starts later on the fake clock, after
// leaving and returning to the app, which ends whatever an earlier test left held.
let clock = Date.now() + 1_000_000;

beforeEach(() => {
  clock += 1_000_000;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: clock });
  grace.notePrivacyLockAppState('background');
  grace.notePrivacyLockAppState('active');
});

afterEach(() => {
  mock.timers.reset();
});

/** What the preferences screen queues after turning discreet mode on; counts its runs. */
const queueLock = () => {
  const lock = { runs: 0 };
  grace.runAfterPrivacyIconAlert(() => {
    lock.runs += 1;
  });
  return lock;
};

test('with no icon change expected, the lock runs at once and only once', () => {
  const lock = queueLock();
  assert.equal(lock.runs, 1);

  mock.timers.tick(CAP_MS);
  grace.notePrivacyLockAppState('background');
  grace.notePrivacyLockAppState('active');

  assert.equal(lock.runs, 1, 'not again at the cap, nor when the app is next left');
});

test('once the expected icon change raised no alert, a lock queued afterwards runs at once', () => {
  grace.expectPrivacyIconChange();
  grace.noPrivacyIconAlertExpected();

  const lock = queueLock();

  assert.equal(lock.runs, 1);
});

test('leaving the app releases a held lock at once, and it does not run again later', () => {
  grace.expectPrivacyIconChange();
  const lock = queueLock();
  assert.equal(lock.runs, 0, 'held while the icon change is pending');

  grace.notePrivacyLockAppState('background');
  assert.equal(lock.runs, 1, 'leaving the app answers the wait');

  grace.notePrivacyLockAppState('active');
  grace.expectPrivacyIconChange();
  grace.noPrivacyIconAlertExpected();
  mock.timers.tick(CAP_MS);
  grace.notePrivacyLockAppState('background');
  assert.equal(lock.runs, 1, 'a later icon change or departure does not run it again');
});

test('a held lock whose alert never comes runs at the cap, counted from its own icon change', () => {
  grace.expectPrivacyIconChange();
  const first = queueLock();
  mock.timers.tick(1_000);
  grace.noPrivacyIconAlertExpected();
  assert.equal(first.runs, 1);

  mock.timers.tick(4_000);
  grace.expectPrivacyIconChange();
  const second = queueLock();
  mock.timers.tick(CAP_MS - 1);
  assert.equal(second.runs, 0, 'the alert may still come');

  mock.timers.tick(1);
  assert.equal(second.runs, 1, 'it never came, so the lock runs');
});
