/**
 * What the app last knew about discreet mode's lock, kept outside the keychain.
 *
 * The privacy record (mode and code) lives in the keychain, and a keychain that cannot
 * be read (an unsigned build, a launch while the device is locked, a keychain error)
 * left every install on a full-screen error. This hint lets startup go on without it:
 * 'standard' opens the app, 'discreet' keeps it locked behind the calculator until the
 * keychain answers. It holds no secret, only whether the install locks, which the decoy
 * icon already shows. It lives in the app container, so a reinstall starts without one.
 */
export type PrivacyLockHint = 'discreet' | 'standard';

export const PRIVACY_LOCK_HINT_KEY = 'everybible.privacy.lockHint.v1';

// Loaded on use, as privacyInstallationAdapter does, so the policy stays runnable in Node.
const mmkv = () =>
  (require('../../stores/mmkvStorage') as typeof import('../../stores/mmkvStorage')).mmkvInstance;

export function readPrivacyLockHint(): PrivacyLockHint | null {
  try {
    const hint = mmkv().getString(PRIVACY_LOCK_HINT_KEY);
    return hint === 'discreet' || hint === 'standard' ? hint : null;
  } catch {
    return null;
  }
}

/** Best effort: a hint that cannot be written leaves an unreadable keychain on the retry screen. */
export function writePrivacyLockHint(hint: PrivacyLockHint): void {
  try {
    mmkv().set(PRIVACY_LOCK_HINT_KEY, hint);
  } catch {
    // The hint only matters when the keychain fails; nothing else may break for it.
  }
}
