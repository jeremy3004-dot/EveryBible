# Claude Handoff: Crash Monitoring And Feature Flags Using GSD Phases

## Goal

Close two operational gaps in EveryBible:

1. crash and error visibility on iOS and Android
2. safe rollout and kill-switch control for risky features

This work should be executed as inserted GSD phases, with error monitoring first and feature flags second.

## Why This Matters

EveryBible currently has no real mobile crash visibility and no proper rollout system.

The repo already shows both gaps:

- the admin deep-dive explicitly calls out missing error monitoring and feature flags in [EveryBible-Admin-Portal-Deep-Dive.md](/Users/dev/Projects/EveryBible/EveryBible-Admin-Portal-Deep-Dive.md:101)
- the app already carries a one-off DB-backed toggle pattern, `hide_play_button_from_reading_tab`, in [schema.sql](/Users/dev/Projects/EveryBible/supabase/schema.sql:48) and [syncService.ts](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts:265)

That means:

- crash monitoring is a critical blind spot
- feature flags are clearly needed, but should start narrow

## Decision

Recommended order:

1. **Phase 5.1: Crash Monitoring And Error Visibility**
2. **Phase 5.2: Feature Flags And Kill Switches**

Recommended tool choices:

- **Crash monitoring**: prefer `Sentry` first for fastest time-to-value
- **Flags**: start with a minimal rollout and kill-switch system; do not let “full Unleash vs something simpler” block progress

Fallback choices:

- If self-hosting and cost control matter more than speed, evaluate `GlitchTip` instead of hosted Sentry.
- If Unleash feels too heavy for first adoption, use a simpler flags platform or a tightly scoped internal implementation.

## GSD Phase Insertion

These should be treated as inserted release-hardening phases immediately after the existing release-hardening work.

### Phase 5.1: Crash Monitoring And Error Visibility

**Goal**: Capture fatal crashes, unhandled JS exceptions, important native failures, and high-signal operational errors from production mobile builds.

**Why first**:

- Without this, the team is blind when a real user’s app crashes.
- Feature flags are useful, but they are much more valuable once failures are observable.

**Scope**:

- pick the monitoring vendor with a bias toward fastest safe adoption
- wire the React Native mobile app to report errors from release builds
- configure environment separation for dev, preview, and production
- verify symbolication/source-map quality enough to make reports actionable
- capture enough metadata to triage by app version, platform, device, and user session context
- document how to inspect and act on reports

**Non-goals**:

- full observability platform migration
- tracing every backend function
- alert-routing perfection on day one

**Success criteria**:

1. A production crash or unhandled exception can be seen centrally without waiting for user reports.
2. Reports include enough version, device, and stack data to support triage.
3. The release workflow includes a verification step for monitoring.
4. There is a simple runbook for reading new issues and assigning action.

**Expected outputs**:

- integrated crash monitoring SDK in app
- environment config and release wiring
- verification notes proving events arrive
- `docs/` runbook for monitoring triage

### Phase 5.2: Feature Flags And Kill Switches

**Goal**: Add a minimal but real feature-flag system that supports kill switches and staged rollouts for risky product changes.

**Why second**:

- The app already demonstrates need through `hide_play_button_from_reading_tab`.
- The best first use is operational safety, not experimentation theater.

**Scope**:

- choose the smallest viable feature-flag approach
- support app-wide kill switches for risky surfaces
- support staged rollout for new translations and risky UI changes
- define a clean client-side access pattern so flags do not sprawl across the codebase
- document how flags are created, named, read, defaulted, and retired

**First flags to support**:

- translation rollout gates
- risky reader or audio UI experiments
- emergency disable switch for a broken feature path

**Non-goals**:

- full marketing experimentation suite
- complex user-segmentation science
- dozens of flags on day one

**Success criteria**:

1. The team can disable a broken feature without waiting for a full app release when technically possible.
2. New translations or risky UI changes can be rolled out gradually.
3. Flags have central naming and fallback rules.
4. Existing one-off preference toggles are not confused with rollout flags.

**Expected outputs**:

- integrated flag provider or internal service
- typed client access layer
- first 2-3 production-ready flags
- docs for naming, defaults, rollout, and retirement

## Recommended Architecture Bias

### For monitoring

Prefer this order unless strong constraints say otherwise:

1. `Sentry`
2. `GlitchTip`

Reason:

- Sentry is the fastest path to working crash visibility in React Native.
- GlitchTip is reasonable if you want Sentry-compatible semantics with self-hosting, but it adds ops work.

### For flags

Prefer this order unless the team already knows it wants full self-hosted control:

1. minimal flags implementation or simple hosted flag service
2. `Unleash` if you are sure you need a more serious rollout platform soon

Reason:

- Unleash is a valid choice, but the immediate need is kill switches and safe rollout, not platform complexity.
- The first implementation should bias toward simplicity, centralization, and low maintenance.

## Constraints Claude Should Respect

- Do not overbuild.
- Crash monitoring must land before broader flag complexity.
- Do not conflate synced user preferences with operational rollout flags.
- Keep the first implementation easy to verify on real builds.
- Update release and operational docs as part of the work.
- Prefer maintainable, production-friendly defaults over custom infrastructure unless self-hosting is explicitly justified.

## Claude Execution Brief

Paste the following to Claude:

> We need to execute two inserted GSD phases in EveryBible.
>
> **Order**
> 1. Phase 5.1: Crash Monitoring And Error Visibility
> 2. Phase 5.2: Feature Flags And Kill Switches
>
> **What I want**
> Use the repo’s GSD workflow style and create a concrete implementation plan for both phases. Then execute the work in order, starting with crash monitoring.
>
> **Phase 5.1 requirements**
> - Recommend the fastest safe crash-monitoring choice for this React Native / Expo app, with bias toward Sentry unless a strong repo-specific reason says otherwise.
> - Implement crash/error reporting for release builds with useful environment, version, platform, and stack context.
> - Ensure the setup is actually verifiable, not just installed.
> - Add a concise runbook for triage and release verification.
>
> **Phase 5.2 requirements**
> - Add a minimal real feature-flag system after monitoring is working.
> - Do not overbuild a full experimentation platform if a smaller rollout and kill-switch layer is enough.
> - Make sure rollout flags are clearly separated from user preferences such as `hide_play_button_from_reading_tab`.
> - Support at least kill-switch behavior and gradual rollout for risky features such as translations or reader UI changes.
> - Add docs for naming, defaults, rollout, and retirement.
>
> **Constraints**
> - Keep the system simple and production-friendly.
> - Prefer fast time-to-value over platform maximalism.
> - Update docs as part of the work.
> - Run the relevant verification gates before calling the work done.
> - If the best choice is Sentry first and a lighter flags system before Unleash, say so and implement that path.
>
> **Expected deliverables**
> - inserted GSD phase plan docs
> - code changes for monitoring
> - code changes for feature flags
> - verification evidence
> - operational docs and release checklist updates

## Shorter Claude Prompt

If you want a shorter version:

> Execute two inserted GSD phases for EveryBible: first add crash monitoring and error visibility, then add a minimal feature-flag and kill-switch system. Bias toward Sentry for fastest safe adoption, and do not overbuild feature flags. Separate rollout flags from synced user preferences, verify both phases on real release-like paths, and update docs and release checklists.

## What Good Looks Like

At the end of this work:

- production mobile crashes are visible centrally
- the team can triage issues by version and platform
- risky features can be rolled out more safely
- broken paths can be disabled more quickly
- rollout logic is centralized instead of ad hoc
- release docs reflect the new operational reality
