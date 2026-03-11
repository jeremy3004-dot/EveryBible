# Plan 01 Summary

## Outcome

Startup and auth initialization are now more deterministic. The app no longer keeps a stale persisted signed-in state when no live Supabase session can be restored, and Google sign-in now distinguishes a missing setup from the specific Android-only client ID misconfiguration that this repo had documented incorrectly.

## Changes

- Added `src/stores/authSessionState.ts` as a pure resolver for restored auth state.
- Updated `src/stores/authStore.ts` to clear stale auth on initialization when there is no live session or no backend configuration.
- Updated `src/services/auth/googleSignIn.ts` to surface config availability reasons instead of a bare boolean.
- Updated `src/services/auth/authService.ts` so Google sign-in shows a clearer provider-unavailable message when only the unsupported Android client ID is configured.
- Added focused regression coverage in `src/stores/authSessionState.test.ts` and `src/services/auth/googleSignIn.test.ts`.

## Verification

- `node --test --import tsx src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts`
- `node --test --import tsx src/services/startup/startupService.test.ts src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts src/services/supabase/client.test.ts`
- `npx eslint src/stores/authStore.ts src/stores/authSessionState.ts src/stores/authSessionState.test.ts src/services/auth/authService.ts src/services/auth/googleSignIn.ts src/services/auth/googleSignIn.test.ts`

## Remaining Manual Checks

- Cold-start splash/gate behavior still needs a release-like device check.
- Email/password, Apple, and Google flows still need real device / real backend verification.
