# Phase 35: Signup Simplification And Deferred Auth Conversion - Research

**Researched:** 2026-04-09
**Domain:** Expo / React Native onboarding and auth UX, guest-first entry, local-first sync behavior
**Confidence:** HIGH

<user_constraints>
## User Constraints

- Keep the change simple, maintainable, and production-friendly.
- Use GSD artifacts and stay grounded in the current app, not generic auth best practices.
- Bias toward simplification rather than adding a larger auth or onboarding redesign.

</user_constraints>

<research_summary>
## Summary

EveryBible is already structurally compatible with a guest-first auth experience. The first-run locale flow in [`LocaleSetupFlow.tsx`](../../../src/screens/onboarding/LocaleSetupFlow.tsx) currently asks the user to choose `sign in`, `sign up`, or `guest`, but that choice does not actually complete auth. Instead, `App.tsx` finishes onboarding first and then opens a separate auth route via the queued handoff in [`App.tsx`](../../../App.tsx) and [`rootNavigation.ts`](../../../src/navigation/rootNavigation.ts). That is the biggest simplification opportunity.

The second opportunity is the auth UI itself. [`SignInScreen.tsx`](../../../src/screens/auth/SignInScreen.tsx) and [`SignUpScreen.tsx`](../../../src/screens/auth/SignUpScreen.tsx) duplicate most of the same layout, provider actions, loading rules, and session-hydration behavior. The sign-up version also adds `name` and `confirm password`, which increases friction before the user has seen enough value to justify it.

The good news is that the product already behaves in a local-first way in several important places. For example, reading plans fall back to local progress when the user is not authenticated in [`readingPlanService.ts`](../../../src/services/plans/readingPlanService.ts), while truly synced actions like group creation and session recording still require auth in [`groupService.ts`](../../../src/services/groups/groupService.ts). That means deferred auth is not a conceptual rewrite; it is mostly a product-shell cleanup and a clearer just-in-time prompting strategy.

**Primary recommendation:** remove the onboarding auth-choice step, land users in the app as guests, unify sign-in/sign-up into one auth surface, and reserve auth prompts for the guest surfaces and actions that genuinely benefit from sync or require an account.

</research_summary>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Guest-first onboarding with optional auth later
**What:** Treat onboarding as preference setup, not account setup. Let the user reach the app quickly, then authenticate only when needed.  
**App fit:** The current core reading experience is already usable while signed out, so this pattern aligns with existing product behavior instead of fighting it.

### Pattern 2: One auth shell, mode-specific form content
**What:** Keep one auth screen with shared provider buttons, session hydration, loading states, and navigation chrome, then switch only the email form fields/copy by mode.  
**App fit:** This removes the duplication between `SignInScreen` and `SignUpScreen` while preserving the established `authService` contract.

### Pattern 3: Benefit-led auth prompts at point of need
**What:** Prompt with the reason to sign in ("sync progress", "save your data", "join this group") instead of generic account messaging.  
**App fit:** More/Profile already show guest messaging, and account-bound service paths already exist. This phase should connect those with clearer entry points rather than invent a new auth system.

### Anti-patterns to avoid
- Rebuilding locale onboarding from scratch when Phase 2 already established that the locale flow mostly works.
- Adding new auth gates to local-first features that already behave acceptably for guests.
- Splitting the auth UI into even more shells or route variants while claiming to simplify it.
- Sneaking in backend auth changes, passwordless flows, or provider reconfiguration under a UX-simplification phase.

</architecture_patterns>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Removing the auth-choice step but leaving the queued handoff behind
**What goes wrong:** Onboarding still carries dead `accessMode` plumbing or opens auth unexpectedly after the user thought they were done.  
**How to avoid:** Treat `LocaleSetupFlow` and the `App.tsx` auth handoff as one contract and simplify both together.

### Pitfall 2: Unifying the auth screen but duplicating logic in a new place
**What goes wrong:** The new shared screen becomes a thin wrapper around the old screens, so the duplication is still there.  
**How to avoid:** Centralize shared provider actions, hydration, and CTA messaging in the new shell instead of preserving two separate flows underneath.

### Pitfall 3: Breaking local-first guest behavior while adding just-in-time auth
**What goes wrong:** Simplification turns into more auth friction because previously-local actions suddenly start hard-failing behind a login wall.  
**How to avoid:** Preserve current guest-friendly behavior in services like reading plans, and only add auth pressure at surfaces that actually need sync or account identity.

### Pitfall 4: Keeping verification and success states as modal alerts
**What goes wrong:** The auth flow feels abrupt even after visual simplification because success and failure still eject users through alerts.  
**How to avoid:** Prefer in-flow success messaging and route-aware recovery where possible.

</common_pitfalls>

<validation_architecture>
## Validation Architecture

This phase should lean on focused source/model tests plus one manual flow sweep.

### Automated focus
- `src/screens/onboarding/localeSetupModel.test.ts` for initial-step sequencing after removing the auth-choice step
- a new onboarding source test to verify first-run completion no longer routes to queued auth
- `src/screens/auth/authScreenSource.test.ts` (or its replacement) to lock in shared session-hydration and provider flows on the unified auth surface
- focused source tests for More/Profile guest CTAs and any new auth-intent helper

### Manual focus
- Cold start as a new user: onboarding -> app shell as guest
- Open auth from More/Profile and verify the unified auth surface appears in the expected mode
- Create account with email and confirm the success state feels intentional
- Sign in with Apple/Google and confirm the session still hydrates and dismisses the auth surface correctly

### Planning implication
This work breaks cleanly into three plans:
1. onboarding contract cleanup
2. unified auth surface
3. just-in-time auth prompts plus verification

</validation_architecture>

<sources>
## Sources

- [`App.tsx`](../../../App.tsx)
- [`src/screens/onboarding/LocaleSetupFlow.tsx`](../../../src/screens/onboarding/LocaleSetupFlow.tsx)
- [`src/screens/onboarding/localeSetupModel.ts`](../../../src/screens/onboarding/localeSetupModel.ts)
- [`src/navigation/rootNavigation.ts`](../../../src/navigation/rootNavigation.ts)
- [`src/navigation/AuthStack.tsx`](../../../src/navigation/AuthStack.tsx)
- [`src/navigation/types.ts`](../../../src/navigation/types.ts)
- [`src/screens/auth/SignInScreen.tsx`](../../../src/screens/auth/SignInScreen.tsx)
- [`src/screens/auth/SignUpScreen.tsx`](../../../src/screens/auth/SignUpScreen.tsx)
- [`src/screens/auth/authScreenSource.test.ts`](../../../src/screens/auth/authScreenSource.test.ts)
- [`src/screens/more/MoreScreen.tsx`](../../../src/screens/more/MoreScreen.tsx)
- [`src/screens/more/ProfileScreen.tsx`](../../../src/screens/more/ProfileScreen.tsx)
- [`src/services/plans/readingPlanService.ts`](../../../src/services/plans/readingPlanService.ts)
- [`src/services/groups/groupService.ts`](../../../src/services/groups/groupService.ts)
- [`.planning/phases/02-onboarding-and-preference-cohesion/02-RESEARCH.md`](../02-onboarding-and-preference-cohesion/02-RESEARCH.md)
- [`docs/plans/2026-03-09-stabilization-pass.md`](../../../docs/plans/2026-03-09-stabilization-pass.md)
- [`docs/plans/2026-03-10-auth-supabase-recovery-plan.md`](../../../docs/plans/2026-03-10-auth-supabase-recovery-plan.md)

</sources>

<metadata>
## Metadata

**Research scope:**
- first-run onboarding/auth coupling
- sign-in vs sign-up UI duplication
- guest-safe vs account-required flows
- verification strategy for a docs-first simplification pass

**Confidence breakdown:**
- Onboarding/auth detour diagnosis: HIGH
- Unified auth shell feasibility: HIGH
- Guest-first compatibility with current local-first product: HIGH
- Broader just-in-time auth coverage outside the highest-signal surfaces: MEDIUM

**Research date:** 2026-04-09
**Valid until:** 2026-05-09

</metadata>

---

*Phase: 35-signup-simplification-and-deferred-auth-conversion*
*Research completed: 2026-04-09*
*Ready for planning: yes*
