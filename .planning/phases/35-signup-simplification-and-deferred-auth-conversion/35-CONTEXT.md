# Phase 35: Signup Simplification And Deferred Auth Conversion - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning
**Source:** Repo analysis + GSD phase creation + current auth/onboarding flow review

<domain>
## Phase Boundary

Simplify EveryBible's first-run entry and authentication experience without changing the backend provider stack or breaking the existing local-first reading model.

This phase covers:
- removing the auth-choice detour from initial onboarding
- unifying the split sign-in and sign-up UI into one auth surface
- shifting auth requests to the moments where sync or account-only actions actually need them

This phase does **not** cover:
- changing Supabase auth providers or backend configuration
- introducing passwordless or magic-link auth
- redesigning settings, privacy, or the broader onboarding locale picker beyond what is required to remove the auth detour
- rewriting local-first services that already degrade gracefully for signed-out users

</domain>

<decisions>
## Implementation Decisions

### First-run onboarding
- **D-01:** Remove the `account` step from initial `LocaleSetupFlow`; first run should only ask for interface language, country, and content language.
- **D-02:** Completing initial onboarding should land the user directly in the app as a guest. Do not auto-open auth after locale setup finishes.
- **D-03:** The later settings-driven locale flow stays separate and minimal; no new auth logic should be added to `mode="settings"`.

### Auth entry strategy
- **D-04:** Authentication becomes just-in-time and context-based. Ask for sign-in only when the user is trying to sync or use an account-bound capability.
- **D-05:** Preserve current local-first guest behavior where it already works well. Reading, browsing, and any plan actions that already degrade to local state should keep working without auth.
- **D-06:** Where the app does interrupt for auth, preserve the user's intent when practical so they can finish the action they started after authenticating.

### Auth surface simplification
- **D-07:** Replace the separate sign-in and sign-up screens with one shared auth surface rather than maintaining two nearly identical shells.
- **D-08:** Social providers are primary. Apple (on iOS) and Google should appear before the email form; email is a secondary fallback, not the hero path.
- **D-09:** The email account-creation path should ask only for `email` and `password` on the first screen. Remove `name` and `confirm password` from the initial create-account step.
- **D-10:** Account-creation success should use a calm, in-flow confirmation state instead of a raw alert-and-close pattern whenever that can be done without backend changes.

### Messaging and navigation
- **D-11:** Guest-facing CTA copy should emphasize the benefit of authentication ("sync progress", "save your progress") rather than generic account language.
- **D-12:** More/Profile guest entry points should deep-link into the unified auth surface in sign-in mode.
- **D-13:** The current queued initial-auth routing in `App.tsx` and `rootNavigation.ts` should be removed or collapsed once onboarding no longer passes an auth mode back out.

### the agent's Discretion
- Exact auth-screen toggle treatment (segmented control, tabs, inline switch, or equivalent)
- Whether the auth surface remains modal or becomes a standard pushed screen
- Exact wording for guest CTAs and success states, as long as it stays translatable and benefit-led
- Which account-bound surfaces beyond More/Profile should adopt just-in-time auth in this phase, so long as the highest-signal guest paths are covered first

</decisions>

<specifics>
## Specific Ideas

- The current friction comes from asking for `Sign in / Create account / Guest` inside onboarding, then finishing onboarding and opening a separate auth flow afterward anyway.
- The current app already supports guest usage for core scripture flows, so the simplified experience should lean into that strength rather than fight it.
- The unified auth surface should feel like a lightweight gateway, not a second onboarding sequence.
- The product tone should stay calm and practical: "sync your progress" is a better frame than "create an account" in guest surfaces.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current onboarding and handoff
- `App.tsx` — initial onboarding gate, pending auth handoff, and current auth-flow queueing behavior
- `src/screens/onboarding/LocaleSetupFlow.tsx` — current initial onboarding flow including the auth-choice step
- `src/screens/onboarding/localeSetupModel.ts` — step-order contract for `initial` vs `settings` onboarding modes
- `.planning/phases/02-onboarding-and-preference-cohesion/02-RESEARCH.md` — prior decision to treat locale flow as mostly-correct and avoid unnecessary redesign

### Current auth surface
- `src/navigation/AuthStack.tsx` — current split auth-stack structure
- `src/navigation/rootNavigation.ts` — current `openAuthFlow` and queued-mode navigation helper
- `src/navigation/types.ts` — auth-stack and More-stack route contracts
- `src/screens/auth/SignInScreen.tsx` — current sign-in shell and provider flow
- `src/screens/auth/SignUpScreen.tsx` — current sign-up shell and extra email fields
- `src/screens/auth/authScreenSource.test.ts` — existing auth-screen source assertions that will need to move with the new unified surface
- `docs/plans/2026-03-09-stabilization-pass.md` — recent auth-screen simplification and error-code stabilization work
- `docs/plans/2026-03-10-auth-supabase-recovery-plan.md` — current backend/auth capability assumptions that must remain intact

### Guest surfaces and account-bound flows
- `src/screens/more/MoreScreen.tsx` — current primary guest CTA in the More tab
- `src/screens/more/ProfileScreen.tsx` — guest profile CTA and sign-in framing
- `src/services/plans/readingPlanService.ts` — proves plan progress already degrades gracefully to local state for signed-out users
- `src/services/groups/groupService.ts` — example of genuinely account-bound synced actions that should keep requiring auth

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LocaleSetupFlow`: already centralizes first-run and settings-driven locale selection; phase work should adjust step order, not replace the flow.
- `authService` provider helpers: already normalize Apple/Google/email auth behavior and should remain the service boundary.
- `MoreStack` modal auth route: already gives the app one place to present authentication from guest surfaces.

### Established Patterns
- The app is intentionally local-first. Many experiences continue working without a backend session, and sync is additive.
- Theme and i18n rules are strict: all visible copy must use translation keys and all colors must come from `useTheme()`.
- Auth-session hydration currently happens in-screen after successful provider/email flows; the unified surface must preserve that contract.

### Integration Points
- `App.tsx` onboarding completion currently hands an auth mode back to the root shell; this phase should remove that coupling.
- `AuthStack` and `rootNavigation` are the main cross-app auth entry points and are the right place to simplify navigation.
- More/Profile are the clearest guest surfaces for benefit-led sign-in prompts.
- Plans already behave well for guests; synced groups do not. That distinction should shape where this phase adds auth pressure.

</code_context>

<deferred>
## Deferred Ideas

- Passwordless or magic-link auth
- Anonymous cloud identities or guest-to-account merge logic beyond current local-first behavior
- A broader rewrite of synced group, prayer, or analytics auth-required error handling
- Replacing Supabase email verification behavior itself instead of just improving the UI around it

</deferred>

---

*Phase: 35-signup-simplification-and-deferred-auth-conversion*
*Context gathered: 2026-04-09*
