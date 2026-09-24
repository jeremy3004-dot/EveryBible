# Mobile client security review — 2026-09-24

Scope: the Expo/React Native app (`src/`, `App.tsx`, `app.json`, `app.config.js`, `eas.json`,
the committed iOS `Info.plist`). The server side was audited separately in
`supabase-security-audit-2026-09-24.md`. Baseline: `origin/main` @ 195717e1. Nothing was built with
EAS, deployed, or written to Supabase.

## Summary

| Severity | Count | Fixed here |
| -------- | ----- | ---------- |
| Critical | 0     | —          |
| High     | 0     | —          |
| Medium   | 2     | 1 (C-M1)   |
| Low      | 6     | 0          |

Most of the risky surfaces had already been hardened by earlier passes, and this review confirmed
those protections hold: recovery-link session fixation, JWKS pinning, SHA-256 checks on text packs,
path-traversal guards, the passcodes in the keystore, and the dev passcode kept out of release
builds. The one fix in this pass narrows the EL signing trust store in release builds.

---

## Medium

### C-M1 — Release builds trusted the EL _dev_ signing key for live catalogs and manifests (FIXED)

**Evidence.** `src/services/elMedia/elJwks.ts` pinned two ES256 keys and `getElKeys()` returned
both in every build: `lqd-prod-2026-a` (signs everything live) and `lqd-dev-2026-a` (signed Every
Language's offline fixture pack, `lqd-fixture-pack-2026-07-18.zip`, handed over in
`lqd-jeremy-handoff-2026-07-19`). The only reason the dev key was pinned was so that tests could
verify the fixtures through the production path (`docs/plans/2026-08-03-el-media-integration.md`
§A2: "Pin BOTH").

**Why it matters.** The whole purpose of the signature layer is to hold up when the media origin or
TLS is compromised. Fixture-pack keys are handled much more loosely than production keys: they sit
on developer machines, in CI, and in handoff zips. Anyone holding the dev private key, plus any way
to serve bytes (R2 write access, a stolen origin credential, or a mis-issued certificate), could
forge a catalog or audio manifest that store builds accepted. That would let them substitute
chapter audio and its checksums, or change translation names and metadata.

**Fix.** `getElKeys()` now returns the dev key only when `__DEV__` is true, which matches the split
`elMediaConfig.ts` already uses to pick `catalog.dev.json`. Store and preview builds trust
`lqd-prod-2026-a` alone. Tests written first and seen failing:

- `elJwks.test.ts`: "a release runtime trusts only the production signing key", and "a development
  runtime also trusts the fixture-pack dev key".
- `elCatalogService.test.ts`: "a release build rejects a catalog signed with the fixture-pack dev
  key". This goes end to end through the default `getKeys`, checks that the result is null, and
  checks that nothing is persisted. The existing default-wiring test now runs under `__DEV__`.

**Residual.** A catalog payload that a release build had already cached (`el-media:last-catalog`)
does not record which key signed it, so it is not re-checked. Live content is signed with the prod
key, so no dev-signed payload should be cached anywhere. If you want certainty, bump the storage key
on the next EL schema change.

### C-M2 — Password-reset tokens travel over a non-exclusive custom URL scheme (implicit flow) — NOT fixed

**Evidence.** The Supabase client uses the default implicit flow
(`src/services/supabase/client.ts`, with no `flowType`, so auth-js defaults to `'implicit'`).
`resetPasswordForEmail` redirects to `com.everybible.app://reset-password`
(`src/services/auth/authService.ts:317-318`). The link arrives carrying `access_token` and
`refresh_token` in the fragment. The app has no verified App Links or Universal Links: there are
no `associatedDomains` or `intentFilters`.

**Exploit.** Custom schemes are not exclusive on either platform. On Android, a malicious app that
declares an intent filter for `com.everybible.app` appears in the chooser when the user taps the
reset email link. If the user picks it, it receives a live access token and refresh token for the
victim's account, which is a full takeover. On iOS, when two apps claim the same scheme, which one
opens is undefined. The app's own hardening does not help here. It parks the tokens, requires
confirmation, and refuses links for a different account (`authDeepLink.ts` and
`authRecoveryLink.ts`, verified correct), but it only protects the EveryBible app, not a hijacker.

**Recommended fix (not applied, because it needs a live email round trip and device testing):**
switch the client to `flowType: 'pkce'`. The link then carries `?code=…`, which is useless without
the code verifier that `resetPasswordForEmail` stores in SecureStore on the requesting device.
`ResetPasswordScreen` would call `exchangeCodeForSession(code)` after the user confirms. Because an
attacker's code cannot be exchanged on the victim's device, PKCE also removes the injected-link
session-fixation case outright. The email must be opened on the device that requested the reset,
which is normal for a mobile-only flow. Verified App Links and Universal Links on `everybible.app`
are the complementary, longer-term fix.

---

## Low

- **C-L1: The audio share export path does not validate its ids itself.**
  `audioShareService.ts:36-41` interpolates `translationId` and `bookId` into a path without
  `assertSafeAssetId`. It is not exploitable today, because the only caller
  (`BibleReaderScreen.tsx:2759,2836`) first resolves the downloaded file through
  `getChapterAudioFileUri`, which asserts both ids and throws. Catalog parsers also drop unsafe ids.
  Add the assert at the builder anyway, to match `audioDownloadService.ts:412` and
  `cloudTranslationService.ts:83`.
- **C-L2: Absolute `http://` asset URLs are accepted from catalog data.**
  `bibleAssetBaseUrl.ts:36-53` passes through `http://` URLs. iOS ATS
  (`NSAllowsArbitraryLoads=false`) and Android's default cleartext block stop them at the transport
  layer. The exception is `NSAllowsLocalNetworking=true` in the production `Info.plist`, which
  still permits local or `.local` hosts. Text packs are SHA-256 checked (sha256 is mandatory in
  `bibleDataModel.ts:111`). Audio is size- or SHA-checked only when it is downloaded, not when it is
  streamed. Tighten the check to `https://` and drop `NSAllowsLocalNetworking` from release builds.
- **C-L3: The Supabase session keychain item uses the default accessibility.** The adapter in
  `supabase/client.ts:38-58` does not pass `keychainAccessible`, so the refresh token is stored as
  `WHEN_UNLOCKED` rather than `…_THIS_DEVICE_ONLY`. That means it migrates to a new device through
  encrypted backups. The privacy PIN already uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Changing the
  accessibility of an existing item needs a read-then-rewrite migration, or users get signed out.
- **C-L4: The Bible.is API key ships in the app config.** `EXPO_PUBLIC_BIBLE_IS_API_KEY` goes
  through `app.config.js` into `extra.publicRuntimeConfig`, and `audioRemote.ts:521` puts it in the
  query string. It is public by design and needed at runtime, but anyone can extract it, which
  exposes the quota and terms of service. Rotate it if it is abused. Proxying it would have to go
  through a server.
- **C-L5: Google sign-in sends no nonce.** `authService.ts:239` sends no nonce, while Apple
  sign-in has a mandatory one. The native Google SDK token is audience-bound, so this is only
  replay hardening. Add a nonce when `@react-native-google-signin` exposes one for this flow.
- **C-L6: The MMKV store is plaintext and included in Android backups.** Notes, annotations,
  reading history, and the feedback-mode flag live in MMKV (not encrypted). Expo's Android default
  is `allowBackup=true`, so this data goes to the user's Google backup. No credentials are in MMKV:
  the passcodes and the session are in SecureStore, and `authStore` persists only preferences
  (`authStore.ts:545-551`). This is accepted risk; note it in the privacy policy.

## Verified in place (no finding)

- **Deep links.** `linkingConfig.ts` maps only `bible/{slug}/{chapter}/{verse?}` (through
  `parseBibleDeepLink`, which uses allow-listed slugs and integer chapters) and `reset-password`.
  React Navigation 7.14 returns `undefined` for any other path when a `screens` config exists, so
  no link reaches the translator, admin, feedback, or diagnostics screens, or injects params.
  Malformed `%` escapes are rejected before the vendor decoder (`buildBibleNavState.ts`).
  Notification taps do not navigate (`App.tsx:505-515`).
- **Recovery links.** An exact-prefix match on `com.everybible.app://reset-password` with a
  boundary check, `type=recovery` required. Tokens are parked, never auto-applied. A link for a
  different account is refused while signed in, and the account email is shown before the user
  confirms.
- **Links opened by the app.** `Linking.openURL` is only called with constant URLs
  (`AboutScreen.tsx`). The app has no WebView, no `WebBrowser`, and no HTML rendering of remote
  content.
- **Tokens.** The Supabase session lives in SecureStore. The translator and council passcodes live
  in SecureStore and were scrubbed from MMKV by a migration (`translatorReviewStore.ts`). The privacy
  PIN is salted, hashed, and has exponential lockout. Bearer tokens are only sent to Supabase
  functions on the configured project. Release builds have no `console.log` of tokens, emails,
  notes, or notification payloads. The remaining `console.log` calls are `__DEV__`-gated timing
  marks. Analytics properties are reading and audio counters, with no free text.
- **Secrets in the bundle.** I ran `expo export --platform ios` with canary values for
  `EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `R2_SECRET_ACCESS_KEY`. None of the canaries appear in the bundle, and the dev passcode compiles to
  `{…: void 0}`. This closes the "not verified" part of server-audit item L10. `src/` has no
  JWT-shaped, `sk_`, `sb_secret_`, or PEM literals. The only JWS strings are the signed EL test
  fixtures. The non-public variables in `.env` (`SUPABASE_SERVICE_ROLE_KEY`, `R2_*`) are never
  referenced from `src/`.
- **Downloads.** Every server-supplied id passes `SAFE_ASSET_ID_RE` (no `/`, no leading dot) at
  the parser and again at each path builder (`cloudTranslationService.ts`,
  `audioDownloadService.ts`). Text packs require a SHA-256, which is checked with a chunked pure-JS
  hash that fails closed, and then a schema, verse-count, and identity check before an atomic
  activation. EL catalogs and manifests are ES256-verified against the pinned keys only, with no
  runtime JWKS discovery. Verification uses `@noble/curves` 1.9.7 with compact signatures,
  `lowS:false`, a pre-hashed digest, and the header `alg` enforced. They are fetched over https
  only, with a sequence rollback guard. Manifest audio is checked by byte count and SHA-256.

## Dependency audit (`npm audit --omit=dev --package-lock-only`)

The audit reports 29 entries (2 critical, 9 high, 18 moderate). None is reachable from the shipped
mobile runtime:

| Advisory package                                                              | Pulled in by                | Reachable in app?                                                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maplibre-gl` (critical, XSS)                                                 | `apps/admin`, `apps/site`   | No. Web apps only. Pass to the web lane.                                                                                                                   |
| `tar` (critical)                                                              | `@expo/cli`, `supabase` CLI | No. Build and dev tooling.                                                                                                                                 |
| `postcss`, `image-size`, `metro*`, `@expo/*`, `expo` (propagated)             | Next and Metro build chain  | No. Build time only.                                                                                                                                       |
| `uuid` via `xcode`                                                            | config plugins              | No. Prebuild only.                                                                                                                                         |
| `decode-uri-component` ≤0.4.2 via `query-string` via `@react-navigation/core` | deep-link parsing           | Yes, but mitigated. Malformed escapes are rejected in `buildBibleNavState.ts` before the vendor parser runs (covered by `linkingConfig.behavior.test.ts`). |

## Verification

- EL suites: `node --test --experimental-test-module-mocks --import tsx src/services/elMedia/*.test.ts`
  gives 112 passed. The three new tests failed before the fix.
- `npm run typecheck` is clean. ESLint and Prettier are clean on the changed files.
- Full `npm test`: 5,111 tests, 5,111 passed, 0 failed.
- Bundle canary check: `expo export --platform ios --no-bytecode`, then `grep` for the canary values
  (0 hits each).
