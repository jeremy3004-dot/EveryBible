---
phase: 1
slug: startup-and-backend-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Quick run command** | `node --test --import tsx src/services/startup/startupService.test.ts src/services/supabase/client.test.ts src/services/auth/googleSignIn.test.ts src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --import tsx src/services/startup/startupService.test.ts src/services/supabase/client.test.ts src/services/auth/googleSignIn.test.ts src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-03 | unit | `node --test --import tsx src/services/startup/startupService.test.ts src/services/supabase/client.test.ts` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-01, AUTH-02 | unit/manual | `node --test --import tsx src/services/auth/googleSignIn.test.ts src/services/auth/authErrors.test.ts` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | SYNC-01, SYNC-02 | unit | `node --test --import tsx src/services/sync/syncMerge.test.ts src/stores/persistedStateSanitizers.test.ts` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 1 | AUTH-01, AUTH-02, AUTH-03, SYNC-01, SYNC-02 | manual/config | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements.
- [ ] Add any missing focused tests discovered during plan execution near the touched startup/auth/sync modules.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold-start reaches the correct gate with no splash flicker | AUTH-03 | Expo warns dev builds do not fully mirror release splash behavior | Install a release-like build on iOS and Android, cold launch, and confirm the app lands on onboarding, privacy lock, or main shell without white flash |
| Apple and Google sign-in succeed on real devices | AUTH-01, AUTH-02 | Provider callbacks and native config are platform/build dependent | Exercise both providers on supported device builds and confirm the app restores the authenticated shell after relaunch |
| Progress and preference sync behave correctly after reconnect | SYNC-01, SYNC-02 | Network/lifecycle timing is hard to prove with current automated tests alone | Make local changes offline or before reconnect, foreground/reconnect the app, and confirm merged state is preserved correctly |
| Expo/native config is aligned for current architecture and deep links | AUTH-01, AUTH-02, AUTH-03 | Config mismatches can pass unit tests but fail builds or callbacks | Compare `app.json`, iOS config, Android config, and Supabase redirect settings before calling Phase 1 complete |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
