---
phase: 1
slug: startup-and-backend-hardening
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner + `tsx` |
| **Config file** | `package.json` test script |
| **Quick run command** | `node --test --import tsx src/services/startup/startupService.test.ts src/services/startup/runtimeConfig.test.ts src/services/supabase/client.test.ts src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --import tsx src/services/startup/startupService.test.ts src/services/startup/runtimeConfig.test.ts src/services/supabase/client.test.ts src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-03 | unit | `node --test --import tsx src/services/startup/startupService.test.ts src/services/supabase/client.test.ts` | ✅ | ✅ green |
| 1-01-02 | 01 | 1 | AUTH-01, AUTH-02 | unit/manual | `node --test --import tsx src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts src/services/auth/authErrors.test.ts` | ✅ | ✅ green |
| 1-01-03 | 01 | 1 | AUTH-01, AUTH-02, AUTH-03 | unit | `node --test --import tsx src/services/startup/startupService.test.ts src/stores/authSessionState.test.ts src/services/auth/googleSignIn.test.ts src/services/supabase/client.test.ts` | ✅ | ✅ green |
| 1-02-01 | 02 | 2 | SYNC-01, SYNC-02 | unit | `node --test --import tsx src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts src/services/startup/startupService.test.ts` | ✅ | ✅ green |
| 1-02-02 | 02 | 2 | AUTH-01, AUTH-02, AUTH-03, SYNC-01, SYNC-02 | config/contract | `node --test --import tsx src/services/startup/runtimeConfig.test.ts && npx expo config --type public && rg -n "enable_signup = true|handle_new_user|profiles" supabase/config.toml supabase/schema.sql supabase/migrations/20240101000000_initial_schema.sql` | ✅ | ✅ green |
| 1-02-03 | 02 | 2 | AUTH-01, AUTH-02, AUTH-03, SYNC-01, SYNC-02 | regression/manual | `npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements.
- [x] Add any missing focused tests discovered during plan execution near the touched startup/auth/sync modules.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold-start reaches the correct gate with no splash flicker | AUTH-03 | Expo warns dev builds do not fully mirror release splash behavior | Install a release-like build on iOS and Android, cold launch, and confirm the app lands on onboarding, privacy lock, or main shell without white flash |
| Email/password account creation succeeds against the intended Supabase project | AUTH-01 | Confirmation email behavior, backend signup settings, and redirect handling are environment dependent | Create a new account on a release-like build, complete any confirmation step, and confirm the account can sign back in after relaunch |
| Apple and Google sign-in succeed on real devices | AUTH-02 | Provider callbacks and native config are platform/build dependent | Exercise both providers on supported device builds and confirm the app restores the authenticated shell after relaunch |
| Progress and preference sync behave correctly after reconnect | SYNC-01, SYNC-02 | Network/lifecycle timing is hard to prove with current automated tests alone | Make local changes offline or before reconnect, foreground/reconnect the app, and confirm merged state is preserved correctly |
| Expo/native config and Supabase contracts are aligned for current architecture and deep links | AUTH-01, AUTH-02, AUTH-03, SYNC-01, SYNC-02 | Config or backend-contract mismatches can pass unit tests but fail builds, callbacks, or first sync | Compare tracked config (`app.json`, `.env.example`, `supabase/config.toml`, schema artifacts) and, when native folders exist locally, confirm generated iOS/Android output still matches before calling Phase 1 complete |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated evidence complete; manual device validation pending
