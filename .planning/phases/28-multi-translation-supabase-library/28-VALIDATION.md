---
phase: 28
slug: multi-translation-supabase-library
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (existing) |
| **Config file** | `package.json` (jest config) |
| **Quick run command** | `npm test -- --testPathPattern=bible` |
| **Full suite command** | `npm test` |
| **Type check** | `npm run typecheck` |
| **Lint** | `npm run lint` |
| **DB verify** | `npm run verify:bible-db` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm run lint`
- **After every plan wave:** Run `npm test && npm run verify:bible-db`
- **Before `/gsd:verify-work`:** Full suite must be green + manual translation download verified
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 28-01-01 | 01 | 1 | SCHEMA | integration | `supabase db push && supabase db status` | ⬜ pending |
| 28-01-02 | 01 | 1 | IMPORT | integration | `npx ts-node scripts/import-translations.ts --dry-run` | ⬜ pending |
| 28-02-01 | 02 | 2 | SEED | manual | Supabase Dashboard: `SELECT COUNT(*) FROM bible_translations` | ⬜ pending |
| 28-03-01 | 03 | 3 | DOWNLOAD | manual | TranslationBrowser → tap cloud translation → download → read | ⬜ pending |
| 28-03-02 | 03 | 3 | OFFLINE | manual | Airplane mode → read downloaded translation | ⬜ pending |
| 28-04-01 | 04 | 4 | TYPECHECK | automated | `npm run typecheck` 0 errors | ⬜ pending |
| 28-04-02 | 04 | 4 | TESTS | automated | `npm test` all passing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new test framework needed.

New test stubs to create:
- [ ] `src/services/bible/__tests__/perTranslationDb.test.ts` — test per-translation SQLite file creation and query

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Download translation from cloud | Requires live Supabase + device | Open Translation Browser → cloud section → tap a translation → verify download progress → read Genesis 1:1 |
| Offline reading after download | Requires simulator airplane mode | Download a translation → enable airplane mode → navigate to Genesis 1:1 → verify text loads |
| Bundled BSB/WEB/ASV unaffected | Regression test | Switch to BSB → read Genesis 1 → verse count matches expected (1,533) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
