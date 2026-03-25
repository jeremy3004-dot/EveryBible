---
phase: 30
slug: animated-chapter-swipe-and-reader-gestures
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test --import tsx`) |
| **Config file** | none — scripts in package.json |
| **Quick run command** | `npm run lint && npm run typecheck` |
| **Full suite command** | `npm run release:verify` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run lint && npm run typecheck`
- **After every plan wave:** `npm run release:verify`
- **Before `/gsd:verify-work`:** Full suite green + manual device build (new dev build required — native modules changed)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 0 | Install | typecheck | `npm run typecheck` | n/a | ⬜ pending |
| 30-01-02 | 01 | 0 | SWIPE-01/02/03 | unit | `npm run test:release` | ❌ W0 | ⬜ pending |
| 30-01-03 | 01 | 1 | SWIPE-01/02/03 | unit + typecheck | `npm run test:release && npm run typecheck` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 1 | SCROLL-01 | manual | device QA | — | ⬜ pending |
| 30-01-05 | 01 | 1 | MODAL-01 | manual | device QA | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `react-native-reanimated@~3.19.5` installed (NOT 4.x — old arch incompatible)
- [ ] `react-native-gesture-handler@~2.28.0` installed
- [ ] `App.tsx` — add `GestureHandlerRootView` as outermost wrapper
- [ ] `src/screens/bible/bibleReaderSwipeModel.test.ts` — unit tests for swipe threshold logic (SWIPE-01, SWIPE-02, SWIPE-03)
- [ ] Metro cache cleared: `npx expo start --clear` (after native module install)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Header collapses on scroll | SCROLL-01 | UI animation — cannot test in Node | Build dev client, open Bible reader, scroll down slowly, verify header fades/collapses |
| Header re-appears on scroll up | SCROLL-01 | UI animation | Continue from above, scroll back up, verify header returns |
| Follow Along modal spring transition | MODAL-01 | Animation timing | In Listen mode, tap "Show Text", verify smooth spring open; tap close, verify smooth dismiss |
| Swipe left/right navigates chapters | SWIPE-01/02 | Gesture simulation unreliable in Jest | Open reader, swipe right → goes to previous chapter; swipe left → goes to next |
| Swipe does not trigger mid-scroll | Gesture conflict | Device-only | Scroll slowly then swipe — only vertical scroll should fire |
| Audio continues during swipe navigation | AUDIO-01 | Requires live audio | Start playing chapter, swipe to next — audio should transfer without gap or stacking |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
