/**
 * Bibles built into the EveryBible app, keyed by ISO 639-3. These are on every
 * install, offline, whatever the live catalog says (see the bundled BSB entry
 * in src/constants/translations.ts). Everything else in the app's library is
 * published remotely and changes, so language pages do not name it: they say
 * the library is growing and point to the app instead of making a claim that
 * could go stale.
 */
export const BUNDLED_APP_BIBLES: Readonly<Record<string, readonly string[]>> = {
  eng: ['Berean Standard Bible'],
};

export function bundledAppBibles(iso6393: string | null): readonly string[] {
  return iso6393 && Object.hasOwn(BUNDLED_APP_BIBLES, iso6393) ? BUNDLED_APP_BIBLES[iso6393] : [];
}
