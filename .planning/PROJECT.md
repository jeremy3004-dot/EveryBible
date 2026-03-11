# EveryBible

## What This Is

EveryBible is a mobile Bible study app for multilingual readers and discipleship groups, especially in contexts where connectivity can be unreliable. It combines offline scripture access, audio playback, onboarding and privacy controls, and group-oriented learning flows on top of an Expo / React Native client with Supabase-backed sync.

## Core Value

When someone opens the app, they can reliably read or listen to scripture and continue their discipleship journey even when network conditions are weak or backend features are partially unavailable.

## Requirements

### Validated

- ✓ Offline Berean Standard Bible reading and local scripture search exist in the shipped codebase — existing
- ✓ Audio playback, playback settings, and offline audio download flows exist in the shipped codebase — existing
- ✓ Email, Apple, and Google authentication with persisted session restoration exist in the shipped codebase — existing
- ✓ Interface language, locale, and preference persistence exist across onboarding and settings flows — existing
- ✓ Discreet privacy mode with PIN-backed lock behavior and alternate app icon support exists in the shipped codebase — existing
- ✓ Four Fields lesson content and local discipleship progress tracking exist in the shipped codebase — existing

### Active

- [ ] Stabilize startup, auth, sync, and native configuration so release builds behave predictably on device
- [ ] Finish the first-run and settings loop for locale, privacy, notifications, and user preferences
- [ ] Polish the core read/listen experience and complete the learn/group rollout path into a coherent v1.0 baseline

### Out of Scope

- Full web parity — the current product is shipping as a mobile-first app and web support is explicitly limited
- A custom backend outside Supabase — the existing architecture is already centered on Supabase auth, sync, and SQL policies
- Chat, live video, or social-network-style community features — they add major complexity without strengthening the core read/listen/discipleship value

## Context

This is a brownfield Expo app with committed native iOS and Android projects, a bundled offline Bible dataset, and Supabase schema/migrations already in the repo. The GSD bootstrap began from an existing codebase rather than a blank project, so the current roadmap is framed as "finish and harden what already exists" instead of "invent a new product from scratch."

Recent git history shows concentrated work around onboarding, reader controls, auth/backend recovery, and offline audio downloads. The working tree at initialization time also has active local edits in [`src/components/audio/AudioFirstChapterCard.tsx`](/Users/dev/Projects/EveryBible/src/components/audio/AudioFirstChapterCard.tsx), [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts), and [`src/services/bible/presentation.test.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.test.ts), which is a strong signal that reader/audio presentation remains an active refinement area.

The codebase map in [`.planning/codebase/`](/Users/dev/Projects/EveryBible/.planning/codebase) shows two especially important product tensions:
- the app is intentionally local-first for scripture content, but sync, preferences, and groups each use different persistence paths
- learn/group functionality exists, but part of that surface is not fully wired into the active navigation shell yet

## Constraints

- **Tech stack**: Keep the current Expo / React Native / Supabase foundation — the codebase is already mature enough that replacing core infrastructure would slow delivery
- **Offline reliability**: Scripture reading must remain available without network access — this is the product's primary resilience promise
- **Mobile release safety**: iOS and Android native configuration must stay aligned with Expo config — release regressions are expensive and user-visible
- **Security**: Secrets and auth/session state must stay out of planning artifacts and public commits — the repo already contains credential-shaped files that require care
- **Brownfield delivery**: Prefer incremental hardening and feature completion over wide architectural rewrites — current users depend on existing behavior

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep the existing Expo / React Native mobile stack and evolve in place | The repo already contains substantial product logic, native projects, and EAS setup | ✓ Good |
| Treat the app as local-first for scripture and discipleship progress | Offline reliability is central to the product promise and current architecture | ✓ Good |
| Initialize GSD around a brownfield hardening roadmap instead of a greenfield feature wishlist | The codebase already implements most of the product surface; the higher leverage is completion and stabilization | ✓ Good |
| Use standard-granularity phases with parallel execution and verification enabled | The project is broad enough for phased planning, but we still want plans small enough to execute cleanly | — Pending |
| Defer web parity, realtime collaboration, and custom backend work until the mobile baseline is stable | These areas would expand scope without improving the core reading/listening journey immediately | — Pending |
| Wire local scripture search into the existing Bible browser and reader rather than introducing a separate search route | The service layer already supported offline search; the gap was discoverability, not data plumbing | ✓ Good |
| Gate audio entrypoints by real remote-or-offline capability instead of only `hasAudio` metadata | The product should not advertise streaming or downloads that the current build cannot satisfy | ✓ Good |

---
*Last updated: 2026-03-11 after Phase 3 execution*
