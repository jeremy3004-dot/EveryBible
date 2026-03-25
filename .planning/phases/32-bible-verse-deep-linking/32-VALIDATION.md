---
phase: 32
slug: bible-verse-deep-linking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 32 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) |
| **Config file** | None |
| **Quick run command** | `node --test --import tsx src/services/bible/deepLinkParser.test.ts` |
| **Full suite command** | `npm run test:release` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After Task 1 commit:** `node --test --import tsx src/services/bible/deepLinkParser.test.ts`
- **After Task 2 commit:** `node --test --import tsx src/navigation/linkingConfig.test.ts && npx tsc --noEmit`
- **After Task 3 commit:** `npm run test:release && npm run lint && npm run format:check`
- **Phase gate:** Full suite green before `/gsd:verify-work`

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Req ID | Test Type | Automated Command | File Exists | Status |
|---------|------|------|--------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | DEEP-01–06 | unit | `node --test --import tsx src/services/bible/deepLinkParser.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | DEEP-07 | unit | `node --test --import tsx src/navigation/linkingConfig.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | DEEP-08 | manual | Open app, paste `com.everybible.app://bible/john/3/16` in Safari | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/services/bible/deepLinkParser.test.ts` — covers DEEP-01 through DEEP-06 (slug parsing, round-trip, unknown slug → null)
- [ ] `src/navigation/linkingConfig.test.ts` — covers DEEP-07 (getStateFromPath roundtrip to BibleReader with correct params)
- [ ] Both test files registered in `test:release` script in package.json

---

## Manual-Only Verifications

| Behavior | Req ID | Why Manual | Test Instructions |
|----------|--------|------------|-------------------|
| Opening `com.everybible.app://bible/john/3/16` navigates to John 3 | DEEP-08 | Requires OS-level URL interception | In iOS Simulator, open Safari, type URL, confirm app opens to John 3 with verse 16 focused |
| Share button includes deep link URL | DEEP-09 | Share sheet is native | Open Bible reader, tap share, confirm the URL appears in the share sheet text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Wave 0 covers all MISSING test file references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
