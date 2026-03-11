---
phase: 3
slug: core-reading-and-audio-polish
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner + `tsx` |
| **Config file** | `package.json` test script |
| **Quick run command** | `node --test --import tsx src/services/bible/browserRows.test.ts src/services/bible/dailyScripture.test.ts src/services/bible/presentation.test.ts src/screens/bible/bibleSearchModel.test.ts src/services/audio/audioAvailability.test.ts src/services/audio/audioSource.test.ts src/services/audio/audioDownloadService.test.ts src/services/audio/audioDownloads.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --import tsx src/services/bible/browserRows.test.ts src/services/bible/dailyScripture.test.ts src/services/bible/presentation.test.ts src/screens/bible/bibleSearchModel.test.ts src/services/audio/audioAvailability.test.ts src/services/audio/audioSource.test.ts src/services/audio/audioDownloadService.test.ts src/services/audio/audioDownloads.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | READ-02 | unit | `node --test --import tsx src/screens/bible/bibleSearchModel.test.ts` | ✅ | ⬜ pending |
| 3-01-02 | 01 | 1 | READ-01, READ-02, READ-03 | regression | `node --test --import tsx src/services/bible/browserRows.test.ts src/services/bible/dailyScripture.test.ts src/services/bible/presentation.test.ts src/screens/bible/bibleSearchModel.test.ts` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | READ-01, READ-02, READ-03, READ-04 | regression | `npm test` | ✅ | ⬜ pending |
| 3-02-01 | 02 | 2 | AUDIO-01, AUDIO-03 | unit | `node --test --import tsx src/services/audio/audioAvailability.test.ts src/services/audio/audioSource.test.ts` | ✅ | ⬜ pending |
| 3-02-02 | 02 | 2 | AUDIO-01, AUDIO-02, AUDIO-03 | regression | `node --test --import tsx src/services/audio/audioAvailability.test.ts src/services/audio/audioDownloadService.test.ts src/services/audio/audioDownloads.test.ts src/services/bible/dailyScripture.test.ts` | ✅ | ⬜ pending |
| 3-02-03 | 02 | 2 | AUDIO-01, AUDIO-02, AUDIO-03 | regression | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing test infrastructure already covers core browse/presentation/audio services.
- [x] New Phase 3 logic can be isolated into pure helper tests near the touched surfaces.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Search scripture locally and open the correct chapter offline | READ-01, READ-02 | The app-level RN search UI is not covered by the current automated harness | Put the device offline, search for a known verse phrase, open a result, and confirm the correct chapter loads |
| Continue reading restores the expected book/chapter path after relaunch | READ-03 | Requires persisted store state and app navigation together | Open a chapter, relaunch the app, and confirm "Continue Reading" still returns to that location |
| Daily scripture degrades gracefully when text or audio is unavailable | READ-04 | Depends on runtime config and translation capabilities | Verify the home card on builds with and without audio config and confirm it does not show broken actions |
| Audio playback and downloads only surface supported actions | AUDIO-01, AUDIO-02, AUDIO-03 | Remote API config, download files, and expo-av behavior are device/runtime dependent | Verify streaming with audio configured, verify offline playback after download, and confirm the app hides or disables unsupported audio affordances when remote config is absent |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution; manual device validation still required before calling the phase fully complete
