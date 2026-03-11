# Phase 1: Startup And Backend Hardening - Research

**Researched:** 2026-03-11
**Domain:** Expo / React Native mobile startup, Supabase auth/session restoration, sync hardening
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No user constraints - all decisions at Claude's discretion.
</user_constraints>

<research_summary>
## Summary

Phase 1 should harden the app around the paths that determine whether the product feels trustworthy on a real device: cold start, splash exit timing, session restoration, provider sign-in, and sync merge behavior after auth and reconnects. The current code is already moving in the right direction by using an explicit startup coordinator in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx) and [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts), plus a lazy Supabase client in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts).

The main planning implication is that this phase should not try to redesign the app. It should stabilize the current architecture, align native and Expo configuration, and add verification around the launch/auth/sync loop. Official Expo guidance still supports manually holding the splash screen during critical async work and recommends validating splash behavior on release builds, while current Expo guidance also makes it clear that the New Architecture transition matters for SDK 55+ and should not be left ambiguous across config layers.

**Primary recommendation:** Keep the existing Expo / Supabase architecture, but isolate and verify the critical startup/auth/sync contract end to end before touching broader product surfaces.
</research_summary>

<standard_stack>
## Standard Stack

For this brownfield phase, the standard stack is the current repo stack plus stronger verification rather than new infrastructure.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-splash-screen` | `~31.0.13` | Explicit control over native splash timing | Official Expo path for startup gating in managed apps |
| `@supabase/supabase-js` | `^2.91.0` | Auth, session, and database client | Already anchors backend/auth behavior in this app |
| `expo-secure-store` | `~15.0.8` | Secure storage for auth session persistence | Matches Supabase mobile-session expectations in React Native |
| `@react-native-google-signin/google-signin` + `expo-apple-authentication` | repo versions | Native social auth providers | Existing provider path and current product requirement |
| `@react-native-community/netinfo` + `AppState` | repo versions / platform APIs | Reconnect and foreground sync triggers | Already integrated and appropriate for sync lifecycle control |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `tsx` | repo versions | Fast logic and service verification | For startup/auth/sync regression coverage already near the source |
| Expo app config + native config files | repo current | Build-time source of truth for auth callbacks, scheme, splash, and architecture flags | For config alignment and release safety checks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing startup coordinator | Full bootstrap state machine rewrite | Higher complexity than Phase 1 needs |
| Current SecureStore-based auth persistence | Custom token/session cache | Adds risk without improving the product promise |
| Current merge helpers in [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts) | Server-wins or local-wins blanket policy | Simpler, but more likely to regress real user data |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure For This Phase

Keep the existing structure and concentrate changes in:

```text
App.tsx
src/services/startup/
src/services/auth/
src/services/supabase/
src/services/sync/
src/hooks/
src/stores/
app.json
ios/Podfile.properties.json
android/gradle.properties
ios/EveryBible/Info.plist
android/app/src/main/AndroidManifest.xml
```

### Pattern 1: Critical-then-deferred startup
**What:** Keep only the minimum work required to reach a safe first screen before hiding splash; defer warmups until after render/interactions.  
**When to use:** Any code that runs during cold start or before auth/privacy/onboarding state is known.  
**App fit:** [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx) and [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts) already use this pattern and should remain the Phase 1 backbone.

### Pattern 2: Lazy external client construction
**What:** Create remote clients only when first needed, not at module import time.  
**When to use:** Supabase client setup and any heavy integration likely to run on app start.  
**App fit:** [`src/services/supabase/lazyClient.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/lazyClient.ts) is already a good pattern to preserve and test.

### Pattern 3: Explicit merge helpers for offline-first sync
**What:** Keep conflict rules in pure merge functions that are independently testable.  
**When to use:** Reading progress and preference reconciliation between local and remote state.  
**App fit:** [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts) should remain the single place for merge semantics; orchestration in [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts) should stay thin.

### Anti-Patterns To Avoid
- **Import-time startup work:** Avoid moving auth, privacy, or Bible preload back into module import side effects.
- **Config drift by patching only one layer:** Do not change `app.json` without checking iOS and Android generated/native settings alongside it.
- **Ad hoc sync fixes in screens/hooks:** Keep sync behavior in service/store boundaries so merge logic remains testable.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth token persistence | Custom encrypted storage wrapper | Existing SecureStore adapter in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts) | The core requirement is reliability, not custom storage behavior |
| Splash boot orchestration | Screen-level scattered loading flags | Existing startup coordinator + Expo splash API | Expo already provides the right primitive; fragmentation increases regressions |
| Sync conflict resolution | Inline "latest wins" patches in callers | [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts) | Local-first edge cases are easy to break if merge rules spread |
| Social auth backend glue | Custom provider backend outside Supabase | Current Supabase ID-token sign-in flow in [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts) | Provider integration is already implemented; Phase 1 should validate it, not replace it |

**Key insight:** Phase 1 should reduce ambiguity, not increase it. Reuse the repo’s existing architecture wherever it already matches official platform guidance.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Trusting Expo Go or dev-client startup behavior
**What goes wrong:** Splash and cold-start issues look fine in development but regress in real release builds.  
**Why it happens:** Expo explicitly notes that splash behavior in Expo Go and development builds does not fully match standalone builds.  
**How to avoid:** Test cold start and splash exit on release-like builds for iOS and Android.  
**Warning signs:** White flashes, early splash hide, or auth screen flicker only outside local dev.

### Pitfall 2: Session/auth state is technically restored but not product-safe
**What goes wrong:** A session exists, but the app lands on the wrong gate, provider sign-in fails on device, or sync starts before auth state is stable.  
**Why it happens:** Auth restoration, splash timing, deep-link callbacks, and sync hooks are all lifecycle-sensitive and easy to sequence incorrectly.  
**How to avoid:** Keep auth initialization explicit, validate provider config end to end, and verify that sync starts only after auth initialization completes.  
**Warning signs:** Intermittent sign-in failures, duplicate profile upserts, or sync errors immediately after app launch.

### Pitfall 3: Native / Expo config mismatch
**What goes wrong:** Auth callbacks, startup architecture, or build behavior differ by platform or build type.  
**Why it happens:** `app.json`, native platform files, and generated properties drift independently.  
**How to avoid:** Treat config alignment as part of the phase deliverable, especially around scheme/deep links and New Architecture flags.  
**Warning signs:** iOS and Android behave differently for startup/auth despite identical JS code.
</common_pitfalls>

<validation_architecture>
## Validation Architecture

Phase 1 needs both fast logic checks and a small set of explicit manual release-path verifications.

### Automated focus
- Startup coordinator behavior in [`src/services/startup/startupService.test.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.test.ts)
- Supabase lazy client construction in [`src/services/supabase/client.test.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.test.ts)
- Google auth config safety in [`src/services/auth/googleSignIn.test.ts`](/Users/dev/Projects/EveryBible/src/services/auth/googleSignIn.test.ts)
- Sync merge rules in [`src/services/sync/syncMerge.test.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.test.ts)
- Persisted-state sanitizers in [`src/stores/persistedStateSanitizers.test.ts`](/Users/dev/Projects/EveryBible/src/stores/persistedStateSanitizers.test.ts)

### Manual focus
- Cold start on release-like iOS and Android builds
- Sign-in with Apple and Google on device
- Restart after sign-in to confirm session restoration
- Foreground/reconnect sync behavior after local reading/preference changes
- Platform config sanity for deep links and architecture flags

### Planning implication
At least one Phase 1 plan should improve automated safety around startup/auth/sync logic, and at least one plan should verify native/config alignment and document the manual release checks required before claiming the phase complete.
</validation_architecture>

<open_questions>
## Open Questions

1. **Is the Android New Architecture flag intentionally enabled while Expo and iOS disable it?**
   - What we know: [`app.json`](/Users/dev/Projects/EveryBible/app.json), [`ios/Podfile.properties.json`](/Users/dev/Projects/EveryBible/ios/Podfile.properties.json), and [`ios/EveryBible/Info.plist`](/Users/dev/Projects/EveryBible/ios/EveryBible/Info.plist) indicate legacy architecture, while [`android/gradle.properties`](/Users/dev/Projects/EveryBible/android/gradle.properties) still sets `newArchEnabled=true`.
   - What's unclear: Whether Android is intentionally testing the New Architecture or is simply out of sync.
   - Recommendation: Treat this as a Phase 1 validation target and align or explicitly document the choice.

2. **How much of social auth has been verified outside local development?**
   - What we know: Apple and Google auth flows are implemented in [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts), and provider redirect URIs are configured in [`supabase/config.toml`](/Users/dev/Projects/EveryBible/supabase/config.toml).
   - What's unclear: Whether both providers have been exercised recently on release-like device builds.
   - Recommendation: Make provider verification a plan-level deliverable, not an afterthought.

3. **Is current sync behavior complete for the release promise, or only logically correct in unit tests?**
   - What we know: Merge rules are reasonable and guard against reopening onboarding in [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts).
   - What's unclear: Whether reconnect/foreground/device-restart flows have enough regression evidence.
   - Recommendation: Pair logic tests with manual scenario checks in this phase.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Expo SplashScreen docs: https://docs.expo.dev/versions/latest/sdk/splash-screen/
- Expo New Architecture guide: https://docs.expo.dev/guides/new-architecture/
- Supabase Expo React Native quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
- Supabase Expo React Native social auth guide: https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth

### Repo-grounded sources
- [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts)
- [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)
- [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts)
- [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)
- [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts)
- [`app.json`](/Users/dev/Projects/EveryBible/app.json)
- [`android/gradle.properties`](/Users/dev/Projects/EveryBible/android/gradle.properties)
- [`ios/Podfile.properties.json`](/Users/dev/Projects/EveryBible/ios/Podfile.properties.json)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Expo startup, Supabase auth/session, offline-first sync
- Ecosystem: Expo SDK 54, React Native 0.81, Supabase JS, SecureStore, NetInfo
- Patterns: critical/deferred startup, lazy client creation, explicit merge helpers
- Pitfalls: release-path splash drift, auth sequencing, config mismatch

**Confidence breakdown:**
- Standard stack: HIGH - current repo stack matches official platform guidance
- Architecture: HIGH - startup/auth/sync flow is explicit in source
- Pitfalls: HIGH - risks are visible both in repo state and official docs
- Code examples: MEDIUM - planning will rely more on repo patterns than external snippets

**Research date:** 2026-03-11
**Valid until:** 2026-04-10
</metadata>

---

*Phase: 01-startup-and-backend-hardening*
*Research completed: 2026-03-11*
*Ready for planning: yes*
