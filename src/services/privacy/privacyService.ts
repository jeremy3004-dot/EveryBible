import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PrivacyAppIconMode } from '../../types';
import { setPrivacyAppIcon, supportsDynamicAppIcon } from './appIcon';

const privacySettingsKey = 'everybible.privacy.settings';

// The secure code protects a decoy-icon install on THIS handset. Keeping the
// record device-only means it is never carried into an iCloud/Keychain backup
// and never restores onto a new device — intentional: a restored install should
// come back in standard mode rather than silently locked with a code the user
// may not remember.
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Failures tolerated before throttling kicks in. */
export const PRIVACY_PIN_LOCKOUT_THRESHOLD = 5;
/** First lockout window; each subsequent failure doubles it. */
export const PRIVACY_PIN_LOCKOUT_BASE_MS = 30_000;
/** Ceiling so a forgotten code cannot lock the owner out for days. */
export const PRIVACY_PIN_LOCKOUT_MAX_MS = 30 * 60_000;

export interface PrivacyPinCredential {
  /** Lowercase hex SHA-256 of `${salt}:${pin}`. */
  hash: string;
  /** Hex-encoded 16 random bytes. */
  salt: string;
}

export interface PrivacySettingsRecord {
  mode: PrivacyAppIconMode;
  pinCredential: PrivacyPinCredential | null;
  /**
   * Cleartext code from a pre-hash install. Read-only: it is upgraded to a
   * salted hash on the next successful verification and never written back.
   */
  legacyPin: string | null;
  failedPinAttempts: number;
  pinLockedUntil: number | null;
}

const defaultPrivacySettings: PrivacySettingsRecord = {
  mode: 'standard',
  pinCredential: null,
  legacyPin: null,
  failedPinAttempts: 0,
  pinLockedUntil: null,
};

const isPrivacyAppIconMode = (value: unknown): value is PrivacyAppIconMode => {
  return value === 'standard' || value === 'discreet';
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const readPinCredential = (value: unknown): PrivacyPinCredential | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PrivacyPinCredential>;
  if (!isNonEmptyString(candidate.hash) || !isNonEmptyString(candidate.salt)) {
    return null;
  }

  return { hash: candidate.hash, salt: candidate.salt };
};

const readCount = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const readTimestamp = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
};

// Accepts both the current hashed shape and the legacy `{ mode, pin }` shape so
// an existing install keeps working across the upgrade.
export const sanitizeStoredPrivacySettings = (rawValue: string | null): PrivacySettingsRecord => {
  if (!rawValue) {
    return defaultPrivacySettings;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const pinCredential = readPinCredential(parsed.pinCredential);

    return {
      mode: isPrivacyAppIconMode(parsed.mode) ? parsed.mode : 'standard',
      pinCredential,
      legacyPin: pinCredential === null && isNonEmptyString(parsed.pin) ? parsed.pin : null,
      failedPinAttempts: readCount(parsed.failedPinAttempts),
      pinLockedUntil: readTimestamp(parsed.pinLockedUntil),
    };
  } catch (error) {
    console.error('Failed to parse privacy settings:', error);
    return defaultPrivacySettings;
  }
};

export const hasPrivacyPin = (settings: PrivacySettingsRecord): boolean => {
  return settings.pinCredential !== null || settings.legacyPin !== null;
};

export const loadPrivacySettings = async (): Promise<PrivacySettingsRecord> => {
  const storedValue = await SecureStore.getItemAsync(privacySettingsKey, secureStoreOptions);
  return sanitizeStoredPrivacySettings(storedValue);
};

export const savePrivacySettings = async (settings: PrivacySettingsRecord): Promise<void> => {
  // A `legacyPin` is carried through unchanged: it can only be replaced by a
  // hash once the user types the code correctly, and dropping it on any earlier
  // write (a failed attempt, say) would lock an existing install out for good.
  // Once the upgrade happens, legacyPin is null and the cleartext field is gone.
  await SecureStore.setItemAsync(
    privacySettingsKey,
    JSON.stringify({
      mode: settings.mode,
      pinCredential: settings.pinCredential,
      ...(settings.legacyPin !== null ? { pin: settings.legacyPin } : {}),
      failedPinAttempts: settings.failedPinAttempts,
      pinLockedUntil: settings.pinLockedUntil,
    }),
    secureStoreOptions
  );
  // Icon change is intentionally deferred — callers should call applyPrivacyAppIcon
  // after navigation completes to avoid an OOM crash from concurrent Zustand + AppState churn.
};

export const applyPrivacyAppIcon = async (mode: PrivacyAppIconMode): Promise<void> => {
  await setPrivacyAppIcon(mode);
};

export const clearPrivacySettings = async (): Promise<void> => {
  // Restore the icon before deleting the record: the stored code is the only
  // thing that can unlock a discreet install, so it must survive a refused icon
  // restore or the handset is left wearing the decoy icon with privacy silently
  // switched off.
  const didApplyStandardIcon = await setPrivacyAppIcon('standard');
  if (!didApplyStandardIcon && supportsDynamicAppIcon()) {
    throw new Error('Failed to apply the standard privacy app icon');
  }
  await SecureStore.deleteItemAsync(privacySettingsKey, secureStoreOptions);
};

const toHex = (bytes: Uint8Array): string => {
  let hex = '';
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, '0');
  }
  return hex;
};

const derivePinHash = async (salt: string, pin: string): Promise<string> => {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
};

export const createPrivacyPinCredential = async (pin: string): Promise<PrivacyPinCredential> => {
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  return { salt, hash: await derivePinHash(salt, pin) };
};

/**
 * Exponential backoff once the failure threshold is crossed: 30s, 60s, 120s …
 * capped at PRIVACY_PIN_LOCKOUT_MAX_MS.
 */
export const getPrivacyPinLockoutMs = (failedAttempts: number): number => {
  if (failedAttempts < PRIVACY_PIN_LOCKOUT_THRESHOLD) {
    return 0;
  }

  const doublings = failedAttempts - PRIVACY_PIN_LOCKOUT_THRESHOLD;
  const duration = PRIVACY_PIN_LOCKOUT_BASE_MS * Math.pow(2, Math.min(doublings, 16));
  return Math.min(duration, PRIVACY_PIN_LOCKOUT_MAX_MS);
};

export interface PrivacyPinVerification {
  success: boolean;
  /** Epoch ms until which further attempts are refused, if throttled. */
  lockedUntil: number | null;
  remainingLockoutMs: number;
}

export interface VerifyPrivacyPinOptions {
  /** Injectable clock so the backoff window is testable. */
  now?: number;
}

const matchesStoredPin = async (
  settings: PrivacySettingsRecord,
  candidate: string
): Promise<boolean> => {
  if (settings.pinCredential) {
    const hash = await derivePinHash(settings.pinCredential.salt, candidate);
    return hash === settings.pinCredential.hash;
  }

  return settings.legacyPin !== null && settings.legacyPin === candidate;
};

/**
 * Verifies one or more candidate codes against the stored secure code.
 *
 * The lock screen derives several candidates from a single key sequence, so the
 * whole batch counts as ONE attempt — otherwise a single wrong tap would burn
 * three attempts and trip the backoff almost immediately.
 */
export const verifyPrivacyPinCandidates = async (
  candidates: string[],
  options: VerifyPrivacyPinOptions = {}
): Promise<PrivacyPinVerification> => {
  const now = options.now ?? Date.now();
  const settings = await loadPrivacySettings();

  if (settings.pinLockedUntil !== null && now < settings.pinLockedUntil) {
    return {
      success: false,
      lockedUntil: settings.pinLockedUntil,
      remainingLockoutMs: settings.pinLockedUntil - now,
    };
  }

  if (!hasPrivacyPin(settings)) {
    return { success: false, lockedUntil: null, remainingLockoutMs: 0 };
  }

  let matched = false;
  for (const candidate of candidates) {
    if (await matchesStoredPin(settings, candidate)) {
      matched = true;
      // Upgrade a legacy cleartext record in place, now that we know the code.
      if (!settings.pinCredential) {
        settings.pinCredential = await createPrivacyPinCredential(candidate);
        settings.legacyPin = null;
      }
      break;
    }
  }

  if (matched) {
    if (settings.failedPinAttempts !== 0 || settings.pinLockedUntil !== null) {
      settings.failedPinAttempts = 0;
      settings.pinLockedUntil = null;
    }
    await savePrivacySettings(settings);
    return { success: true, lockedUntil: null, remainingLockoutMs: 0 };
  }

  settings.failedPinAttempts += 1;
  const lockoutMs = getPrivacyPinLockoutMs(settings.failedPinAttempts);
  settings.pinLockedUntil = lockoutMs > 0 ? now + lockoutMs : null;
  await savePrivacySettings(settings);

  return {
    success: false,
    lockedUntil: settings.pinLockedUntil,
    remainingLockoutMs: lockoutMs,
  };
};

export const verifyPrivacyPin = async (
  pin: string,
  options: VerifyPrivacyPinOptions = {}
): Promise<PrivacyPinVerification> => {
  return verifyPrivacyPinCandidates([pin], options);
};

export const updatePrivacyMode = async (
  mode: PrivacyAppIconMode,
  pin: string | null
): Promise<PrivacySettingsRecord> => {
  const pinCredential = mode === 'discreet' && pin ? await createPrivacyPinCredential(pin) : null;

  const nextSettings: PrivacySettingsRecord = {
    mode,
    pinCredential,
    legacyPin: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
  };

  await savePrivacySettings(nextSettings);
  return nextSettings;
};
