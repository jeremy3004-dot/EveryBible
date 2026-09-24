/* global module */

/**
 * Babel plugin: leave `u`-flag regular expressions alone when the bundle
 * targets Hermes.
 *
 * `@react-native/babel-preset` 0.81 always adds
 * `@babel/plugin-transform-unicode-regex`, even for the Hermes profile. That
 * transform rewrites every `/…/u` literal into an ES5 pattern, expanding each
 * `\p{L}`-style property escape into thousands of explicit ranges and
 * surrogate pairs. The Bible reference parser's grammars are built from such
 * escapes: each language file grew from ~70 KB to ~900 KB of minified JS, and
 * the four the app ships made up about a quarter of the iOS bundle.
 *
 * Hermes runs `u`-flag patterns natively, property escapes included (the RN
 * 0.81 `hermes -version` lists "Unicode RegExp Property Escapes"), so the
 * lowering buys nothing there. Web and any non-Hermes engine keep it.
 *
 * All of Babel's regexp-feature plugins share one bitmask on the file, and each
 * plugin's `pre()` switches its own bit on before traversal starts. Clearing the
 * u-flag bit when the Program is entered (before any RegExpLiteral is visited)
 * turns that transform off without touching the named-group or dotAll ones.
 * `scripts/babelHermesUnicodeRegex.test.ts` runs the real app config and fails
 * if a Babel upgrade changes this contract.
 */
const FEATURES_KEY = '@babel/plugin-regexp-features/featuresKey';
const UNICODE_FLAG = 1 << 0;

function hermesNativeUnicodeRegex(api) {
  const engine = api.caller((caller) => (caller && caller.engine) || null);

  return {
    name: 'hermes-native-unicode-regex',
    visitor: {
      Program: {
        enter() {
          if (engine !== 'hermes') {
            return;
          }
          const features = this.file.get(FEATURES_KEY);
          if (typeof features === 'number' && features & UNICODE_FLAG) {
            this.file.set(FEATURES_KEY, features & ~UNICODE_FLAG);
          }
        },
      },
    },
  };
}

module.exports = hermesNativeUnicodeRegex;
