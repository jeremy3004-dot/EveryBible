/**
 * Keeps a discreet install's content out of the OS task switcher.
 *
 * The JS lock (the calculator) renders when the app goes inactive, which races the
 * snapshot the OS takes for the app switcher, and Android's recents thumbnail shows the
 * live window. So whenever discreet mode is on, and only then, a native cover is used:
 *
 * - Android: FLAG_SECURE on the activity window (`preventScreenCaptureAsync`). Recents
 *   shows a blank card. It also blocks screenshots and screen recording; Android has no
 *   way to hide the recents thumbnail without that.
 * - iOS: the app switcher overlay (`enableAppSwitcherProtectionAsync`), added natively on
 *   willResignActive, before the snapshot. The package offers a blur only (no solid
 *   cover), so it runs at maximum intensity. Screenshots are deliberately NOT blocked on
 *   iOS: the threat is passive exposure in the switcher, a screenshot is taken by the
 *   user on purpose, a calculator whose screenshots come out blank is itself a tell, and
 *   the package blocks them by re-parenting the whole key window's layer under a secure
 *   text field, which is too fragile to put under every screen of the app.
 *
 * The package is loaded with import() the first time protection is wanted, so a standard
 * install never evaluates it. Failures are reported and never thrown.
 */
import type * as ScreenCapture from 'expo-screen-capture';
import type { PrivacyAppIconMode } from '../../types';
import type { PrivacyLockHint } from './privacyLockHint';

type ScreenCaptureApi = Pick<
  typeof ScreenCapture,
  | 'preventScreenCaptureAsync'
  | 'allowScreenCaptureAsync'
  | 'enableAppSwitcherProtectionAsync'
  | 'disableAppSwitcherProtectionAsync'
>;

/** Scopes the Android window flag to discreet mode, so another caller cannot lift it. */
export const DISCREET_SCREEN_CAPTURE_KEY = 'discreet';
/** The strongest blur the iOS overlay offers (0 to 1). */
export const APP_SWITCHER_BLUR_INTENSITY = 1;

export interface ScreenCapturePrivacyState {
  isInitialized: boolean;
  mode: PrivacyAppIconMode;
  initializationError: 'timeout' | 'unavailable' | null;
}

export interface ScreenCapturePrivacySource {
  getState(): ScreenCapturePrivacyState;
  subscribe(listener: (state: ScreenCapturePrivacyState) => void): () => void;
}

export interface ScreenCaptureProtectionOptions {
  /** `Platform.OS`; platforms other than iOS and Android get no protection. */
  platform: string;
  store: ScreenCapturePrivacySource;
  readLockHint: () => PrivacyLockHint | null;
  /** Test seam; defaults to a lazy import of the package. */
  loadScreenCapture?: () => Promise<ScreenCaptureApi>;
  /** Test seam; defaults to the crash report queue, loaded lazily. */
  reportFailure?: (error: unknown) => void;
}

export interface ScreenCaptureProtectionHandle {
  stop(): void;
  /** Resolves once every change requested so far has been applied (or has failed). */
  settled(): Promise<void>;
}

/**
 * Whether the app must be covered. Once privacy settings are known, discreet mode
 * decides. Before that, or when they cannot be read, it fails closed: a hint saying
 * discreet protects, and unreadable settings protect unless the hint says standard.
 */
export function shouldProtectScreenCapture(
  state: ScreenCapturePrivacyState,
  readLockHint: () => PrivacyLockHint | null
): boolean {
  if (state.isInitialized) {
    return state.mode === 'discreet';
  }
  const hint = readLockHint();
  if (hint === 'discreet') {
    return true;
  }
  return state.initializationError !== null && hint !== 'standard';
}

const PLATFORM_PROTECTION: Record<
  string,
  (api: ScreenCaptureApi, protect: boolean) => Promise<void>
> = {
  android: (api, protect) =>
    protect
      ? api.preventScreenCaptureAsync(DISCREET_SCREEN_CAPTURE_KEY)
      : api.allowScreenCaptureAsync(DISCREET_SCREEN_CAPTURE_KEY),
  ios: (api, protect) =>
    protect
      ? api.enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR_INTENSITY)
      : api.disableAppSwitcherProtectionAsync(),
};

const loadScreenCaptureModule = (): Promise<ScreenCaptureApi> => import('expo-screen-capture');

// The crash queue opens MMKV and the reporting policy; it is loaded only on failure.
const reportScreenCaptureFailure = (error: unknown): void => {
  void import('../diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('privacy.screenCapture', error))
    .catch(() => undefined);
};

/**
 * Applies the protection now (from the lock hint when settings are not loaded yet) and
 * again on every privacy change. Changes are applied one at a time, in order; one that
 * fails is reported and retried on the next privacy change.
 */
export function startScreenCaptureProtection({
  platform,
  store,
  readLockHint,
  loadScreenCapture = loadScreenCaptureModule,
  reportFailure = reportScreenCaptureFailure,
}: ScreenCaptureProtectionOptions): ScreenCaptureProtectionHandle {
  const applyProtection = PLATFORM_PROTECTION[platform];
  let queue: Promise<void> = Promise.resolve();

  const report = (error: unknown): void => {
    try {
      reportFailure(error);
    } catch {
      // Reporting is best effort; it must not break the lock around it.
    }
  };

  if (!applyProtection) {
    return { stop: () => undefined, settled: () => queue };
  }

  // The window starts unprotected, so nothing is loaded until protection is wanted.
  let applied = false;
  let wanted = false;

  const sync = async (): Promise<void> => {
    if (wanted === applied) {
      return;
    }
    const target = wanted;
    let api: ScreenCaptureApi | null = null;
    try {
      api = await loadScreenCapture();
      await applyProtection(api, target);
      applied = target;
    } catch (error) {
      report(error);
      if (api && target) {
        // The package marks its key active before the native call (Android throws
        // MissingActivity before the window attaches), and a key still marked makes every
        // retry a no-op. Clearing it lets the next privacy change try again.
        await applyProtection(api, false).catch(() => undefined);
      }
    }
  };

  const evaluate = (state: ScreenCapturePrivacyState): void => {
    try {
      wanted = shouldProtectScreenCapture(state, readLockHint);
    } catch (error) {
      // Nothing readable: keep what is applied, and never lift protection on an error.
      report(error);
      return;
    }
    queue = queue.then(sync);
  };

  evaluate(store.getState());
  const unsubscribe = store.subscribe(evaluate);

  return { stop: unsubscribe, settled: () => queue };
}
