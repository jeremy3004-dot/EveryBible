# Stabilization Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify and harden sync, auth error handling, theme/i18n consistency, and regression coverage without reintroducing hidden complexity.

**Architecture:** Move risky reconciliation logic out of imperative service code into small pure merge functions with explicit inputs and outputs. Normalize auth failures around stable machine-readable error codes, then make the UI depend on those codes instead of English strings. Clean screen-level theme/i18n drift directly in the affected screens and add focused tests around the highest-risk behavior.

**Tech Stack:** Expo, React Native, TypeScript, Zustand, Supabase, i18next, Node test runner

---

## Progress

- [x] Create isolated worktree from `origin/main`
- [x] Verify clean baseline with `npm test`, `npm run lint`, and `npx tsc --noEmit`
- [x] Simplify sync reconciliation and add sync tests
- [x] Normalize auth error codes and update auth screens
- [x] Remove theme/i18n drift from profile and auth screens
- [x] Expand targeted regression tests for sync/auth/ui conventions
- [x] Run final verification and prepare handoff

## Progress Log

- 2026-03-09: Created isolated worktree at `~/.config/superpowers/worktrees/EveryBible/codex-stabilization-pass-20260309`
- 2026-03-09: Baseline checks passed before implementation
- 2026-03-09: Extracted sync merge logic into `syncMerge.ts`, added store-owned sync apply actions, and removed direct `setState` writes from `syncService.ts`
- 2026-03-09: Added stable auth error codes plus pure auth error mapping tests, so screens now branch on codes instead of literal provider strings
- 2026-03-09: Cleaned `SignInScreen`, `SignUpScreen`, and `ProfileScreen` to use theme context and translation keys, and simplified the profile stats surface
- 2026-03-09: Final verification passed with `npm test`, `npm run lint`, and `npx tsc --noEmit`

### Task 1: Simplify Sync Reconciliation

**Files:**
- Modify: `src/services/sync/syncService.ts`
- Create: `src/services/sync/syncMerge.ts`
- Create: `src/services/sync/syncMerge.test.ts`
- Modify: `src/services/sync/index.ts`
- Modify: `src/stores/progressStore.ts`
- Modify: `src/stores/bibleStore.ts`
- Modify: `src/stores/authStore.ts`

**Intent:**
- Extract pure merge helpers from `syncService.ts`
- Replace direct store mutation inside sync logic with store-owned apply/hydrate actions
- Keep the sync flow smaller and easier to reason about

**Implementation notes:**
- Introduce explicit snapshot types for local reading state and preference state
- Keep Supabase I/O in `syncService.ts`, but move reconciliation decisions to `syncMerge.ts`
- Add store actions like `applySyncedProgress`, `applySyncedReadingPosition`, and `applySyncedPreferences` instead of `setState` from the service

**Tests:**
- Remote newer chapter wins when local device is still at default state
- Local progress is preserved when it is newer
- Merged chapter maps prefer newer timestamps per chapter
- Preferences merge remains deterministic and does not drop supported values

### Task 2: Normalize Auth Error Handling

**Files:**
- Modify: `src/services/auth/authService.ts`
- Create: `src/services/auth/authService.test.ts`
- Modify: `src/services/auth/index.ts`
- Modify: `src/screens/auth/SignInScreen.tsx`
- Modify: `src/screens/auth/SignUpScreen.tsx`

**Intent:**
- Replace fragile English-string checks with stable error codes
- Keep user-facing messages translated in the screens, not embedded in the service contract

**Implementation notes:**
- Extend `AuthResult` with `code?: AuthErrorCode`
- Introduce error codes like `cancelled`, `in_progress`, `provider_unavailable`, `invalid_credentials`, `configuration`, and `unknown`
- Map Apple and Google provider-specific failures to those codes
- Update the auth screens to branch on `result.code`

**Tests:**
- Google cancel maps to `cancelled`
- Apple cancel maps to `cancelled`
- Unsupported provider state maps consistently
- Screens suppress alerts for `cancelled` but still show alerts for actionable failures

### Task 3: Remove Theme and i18n Drift

**Files:**
- Modify: `src/screens/more/ProfileScreen.tsx`
- Modify: `src/screens/auth/SignInScreen.tsx`
- Modify: `src/screens/auth/SignUpScreen.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: locale mirrors that must stay in sync under `src/i18n/locales/`

**Intent:**
- Make the flagged screens follow project conventions again
- Avoid adding abstraction where direct cleanup is simpler

**Implementation notes:**
- Replace static `colors` imports with `useTheme()`
- Remove hardcoded English copy and route all visible strings through `t(...)`
- Keep styling local to screens; do not introduce a new design system layer for this pass

**Tests / checks:**
- Extend locale coverage test if new keys are added
- Lint and TypeScript should remain green

### Task 4: Expand Focused Regression Coverage

**Files:**
- Create/modify only the smallest necessary test files under `src/**`

**Intent:**
- Raise confidence in the risky paths without ballooning the suite

**Implementation notes:**
- Prefer pure-function tests for sync/auth mapping
- Add only one or two behavioral component/screen tests if a pure test is insufficient
- Avoid broad snapshot testing

**Tests:**
- Sync merge edge cases
- Auth error-code mapping
- Profile/auth screen translation-key usage where practical

### Task 5: Final Verification and Handoff

**Files:**
- Update this plan doc with completion notes

**Run:**
- `npm test`
- `npm run lint`
- `npx tsc --noEmit`

**Done when:**
- Sync logic is smaller and store mutations are store-owned
- Auth screens no longer depend on literal provider error strings
- Profile/auth screens use theme context and translated copy
- Tests cover the new behavior and all checks pass
