---
phase: 2
slug: onboarding-and-preference-cohesion
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner + `tsx` |
| **Config file** | `package.json` test script |
| **Quick run command** | `node --test --import tsx src/screens/onboarding/localeSetupModel.test.ts src/services/onboarding/localeSelection.test.ts src/services/onboarding/interfaceLanguageSelection.test.ts src/services/preferences/reminderPreferences.test.ts src/services/privacy/privacyPreferences.test.ts src/services/privacy/privacyMode.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --import tsx src/screens/onboarding/localeSetupModel.test.ts src/services/onboarding/localeSelection.test.ts src/services/onboarding/interfaceLanguageSelection.test.ts src/services/preferences/reminderPreferences.test.ts src/services/privacy/privacyPreferences.test.ts src/services/privacy/privacyMode.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | LOCL-01 | unit | `node --test --import tsx src/screens/onboarding/localeSetupModel.test.ts src/services/onboarding/interfaceLanguageSelection.test.ts` | ✅ | ⬜ pending |
| 2-01-02 | 01 | 1 | LOCL-01, LOCL-02 | unit | `node --test --import tsx src/services/onboarding/localeSelection.test.ts src/screens/onboarding/localeSetupModel.test.ts` | ✅ | ⬜ pending |
| 2-01-03 | 01 | 1 | LOCL-01, LOCL-02 | regression | `npm test` | ✅ | ⬜ pending |
| 2-02-01 | 02 | 2 | PREF-01 | unit | `node --test --import tsx src/services/preferences/reminderPreferences.test.ts` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 2 | PRIV-01 | unit | `node --test --import tsx src/services/privacy/privacyPreferences.test.ts src/services/privacy/privacyMode.test.ts` | ✅ | ⬜ pending |
| 2-02-03 | 02 | 2 | PRIV-01, PREF-01 | regression | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure can cover locale, reminder, and privacy decision logic with focused unit tests.
- [x] Manual-only device checks are documented for relock and notification behavior.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First launch completes interface language, country, and Bible language selection without dead ends | LOCL-01 | Current automated harness does not exercise the full React Native onboarding UI | Install a release-like build, complete locale setup, and confirm the app proceeds to auth/main flow correctly |
| Locale changes later from settings without reopening onboarding or losing saved values | LOCL-02 | Requires full app navigation and persistence behavior | Change nation/Bible language in settings, relaunch, and confirm selections persist without re-entering onboarding |
| Discreet mode relocks after backgrounding and settings copy remains understandable | PRIV-01 | AppState transitions and icon behavior are device-dependent | Enable discreet mode, background the app, return, and confirm the privacy lock appears and can be unlocked |
| Daily reminder enable/disable/time changes align with actual delivered schedule | PREF-01 | Notification permissions and scheduling are OS/device dependent | Grant notifications permission, enable reminders, change reminder time, disable and re-enable, and confirm the stored time and scheduled reminder remain aligned |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution; manual device validation still required before calling the phase fully complete
