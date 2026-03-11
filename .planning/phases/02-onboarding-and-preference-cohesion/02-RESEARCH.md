# Phase 2: Onboarding And Preference Cohesion - Research

**Researched:** 2026-03-11
**Domain:** Expo / React Native onboarding, locale preferences, discreet-mode privacy, reminder settings
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No user constraints - all decisions at Claude's discretion.
</user_constraints>

<research_summary>
## Summary

Phase 2 should consolidate flows the product already mostly has instead of redesigning onboarding from scratch. The current app already uses a shared [`LocaleSetupFlow`](/Users/dev/Projects/EveryBible/src/screens/onboarding/LocaleSetupFlow.tsx) for first run and later locale updates, and the locale catalog/search layer is already reasonably well-factored in [`src/services/onboarding/localeSelection.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/localeSelection.ts) and [`src/services/onboarding/interfaceLanguageSelection.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/interfaceLanguageSelection.ts). That means LOCL-01 and LOCL-02 are materially present and should be protected with targeted regression evidence rather than a UI rewrite.

The more important product gaps are in the settings loop after onboarding. [`SettingsScreen`](/Users/dev/Projects/EveryBible/src/screens/more/SettingsScreen.tsx) exposes theme, font, interface language, locale, and reminders, but it does not yet expose privacy-mode management even though discreet mode exists and relocks correctly through [`usePrivacyLock`](/Users/dev/Projects/EveryBible/src/hooks/usePrivacyLock.ts) and [`privacyStore`](/Users/dev/Projects/EveryBible/src/stores/privacyStore.ts). Reminder handling is also inconsistent today: re-enabling notifications with an existing reminder time does not reschedule a notification, and the time picker does not initialize from the stored reminder time.

**Primary recommendation:** Keep the shared locale/onboarding architecture, add missing regression coverage for first-run and locale-selection contracts, and spend implementation effort on privacy/settings parity plus reminder-state correctness.
</research_summary>

<standard_stack>
## Standard Stack

For this phase, the standard stack is the existing repo stack plus small pure helpers near the current settings/privacy code.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-localization` | repo version | Device-region defaults for initial locale suggestion | Already powers first-run locale selection |
| `expo-notifications` | repo version | Local reminder permissions and daily scheduling | Already used by settings reminder flow |
| `expo-secure-store` | repo version | Local privacy-mode persistence | Already anchors discreet-mode PIN storage |
| `zustand` | repo version | Local auth/preferences/privacy state | Existing single-source-of-truth pattern for settings and privacy |
| `node:test` + `tsx` | repo versions | Fast logic coverage for locale, reminder, and privacy helpers | Best fit for the repo's current test strategy |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-i18next` | repo version | Copy/label translation | Reuse existing onboarding/settings keys where possible |
| React Navigation native stack | repo version | Settings sub-screen routing | Add privacy management without changing app-shell structure |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure helper modules for reminder/privacy decisions | Component-heavy integration tests | Higher setup cost than the repo's current test harness supports |
| Dedicated settings privacy screen | Folding privacy controls into the main settings list | Faster to ship but more cluttered and harder to explain |
| Reusing existing onboarding privacy copy | Adding new translation keys across every locale immediately | More churn than this phase needs |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Shared flow, mode-specific step list
**What:** Keep one locale flow component but control its behavior through a small step model and mode-specific completion rules.  
**When to use:** First-run locale setup and later locale changes in settings.  
**App fit:** [`LocaleSetupFlow`](/Users/dev/Projects/EveryBible/src/screens/onboarding/LocaleSetupFlow.tsx) plus [`localeSetupModel.ts`](/Users/dev/Projects/EveryBible/src/screens/onboarding/localeSetupModel.ts) already follow this pattern and should remain the basis of LOCL-01 and LOCL-02.

### Pattern 2: Pure decision helpers around platform APIs
**What:** Put time parsing, toggle decisions, and privacy-form validation into small pure functions, then keep the screen thin around permissions, navigation, and Expo APIs.  
**When to use:** Reminder scheduling and privacy-settings save behavior.  
**App fit:** [`SettingsScreen`](/Users/dev/Projects/EveryBible/src/screens/more/SettingsScreen.tsx) currently mixes UI and reminder-state decisions; extracting only the decision logic is the cleanest improvement.

### Pattern 3: Local-only privacy state with explicit UX entrypoint
**What:** Treat discreet mode as device-local behavior stored in SecureStore and exposed clearly from settings, not as part of synced remote preferences.  
**When to use:** PIN creation/update, app relock, and icon/privacy mode changes.  
**App fit:** [`privacyStore.ts`](/Users/dev/Projects/EveryBible/src/stores/privacyStore.ts) and [`privacyService.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyService.ts) already enforce local-only persistence; the missing piece is settings accessibility, not backend sync.

### Anti-Patterns To Avoid
- **Rebuilding locale onboarding:** The current flow already covers the requirement surface well enough to harden rather than replace.
- **Hiding privacy behind onboarding-only UI:** Discreet mode is a device preference and must remain changeable later.
- **Treating enabled reminders as proof of scheduled reminders:** Persisted preference state and actual scheduled notifications must stay aligned.
- **Creating deep abstraction layers for one screen:** Phase 2 needs thin helpers, not a full settings domain rewrite.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale search | Custom ad hoc filtering in the screen | Existing search engines in [`src/services/onboarding/`](\/Users/dev/Projects/EveryBible/src/services/onboarding) | Repo already has localized, fuzzy-search-aware logic |
| Privacy persistence | New storage or sync model | Existing SecureStore-backed privacy service/store | Privacy is intentionally device-local |
| Reminder UI state | Duplicate parsing logic across handlers | One small reminder helper module | Keeps schedule decisions testable and consistent |
| Settings navigation | New nested navigator | Existing `MoreStack` screens | Lowest-risk path for adding privacy settings |

**Key insight:** Phase 2 should finish the user loop around existing state, not invent a new preferences system.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Locale flow appears complete but lacks regression evidence
**What goes wrong:** A future edit breaks initial step order, localized country search, or the later settings path even though the UI still "looks right".  
**Why it happens:** Much of the current locale flow is already implemented, so it is easy to assume it is safe without tests.  
**How to avoid:** Add focused tests around step ordering and locale search behavior before making settings/privacy changes nearby.  
**Warning signs:** Country or language recommendations shift unexpectedly, or first-run flow starts reopening or skipping steps.

### Pitfall 2: Reminder preference and scheduled notifications drift apart
**What goes wrong:** The store says reminders are enabled, but there is no actual scheduled notification, or the picker shows the wrong time.  
**Why it happens:** Permission flow, persisted reminder time, and scheduling side effects are currently handled separately in the screen.  
**How to avoid:** Centralize reminder toggle and picker derivation in pure helper logic, then use that result consistently in the screen.  
**Warning signs:** Enabling reminders after a previous schedule does nothing, or the picker always jumps to `09:00`.

### Pitfall 3: Privacy mode can lock the app but cannot be managed later
**What goes wrong:** Discreet mode works technically, but users cannot confidently change it or rotate their PIN after onboarding.  
**Why it happens:** Privacy storage and relock hooks exist, but the settings surface never exposes them.  
**How to avoid:** Add a dedicated settings screen that reuses existing privacy rules and keeps "standard vs discreet" understandable.  
**Warning signs:** Users must reinstall or reset app state to change privacy behavior.
</common_pitfalls>

<validation_architecture>
## Validation Architecture

Phase 2 needs fast automated coverage for pure onboarding/locale/reminder/privacy decisions plus a smaller manual check for device behavior.

### Automated focus
- Locale step ordering in [`src/screens/onboarding/localeSetupModel.test.ts`](/Users/dev/Projects/EveryBible/src/screens/onboarding/localeSetupModel.test.ts)
- Locale search and localized display names in [`src/services/onboarding/localeSelection.test.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/localeSelection.test.ts)
- Interface-language search coverage in a new [`src/services/onboarding/interfaceLanguageSelection.test.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/interfaceLanguageSelection.test.ts)
- Reminder toggle/picker decisions in a new [`src/services/preferences/reminderPreferences.test.ts`](/Users/dev/Projects/EveryBible/src/services/preferences/reminderPreferences.test.ts)
- Privacy settings submission rules in a new [`src/services/privacy/privacyPreferences.test.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyPreferences.test.ts)
- Existing relock rules in [`src/services/privacy/privacyMode.test.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyMode.test.ts)

### Manual focus
- First-run locale setup through finish on a release-like build
- Locale update from settings without reopening onboarding
- Discreet mode enable/update/disable from settings plus relock after backgrounding
- Reminder enable/disable and time changes on a device with notifications permission granted

### Planning implication
`02-01` should protect the already-working locale path with focused tests and only minimal code edits if a real inconsistency appears. `02-02` should carry the actual behavior changes for privacy/settings parity and reminder correctness.
</validation_architecture>

<open_questions>
## Open Questions

1. **Should changing discreet mode in settings require entering the old PIN first?**
   - What we know: current privacy storage validates only the new PIN format; it does not model PIN rotation with current-PIN confirmation.
   - What's unclear: whether product intent requires a stronger security step for in-app PIN changes.
   - Recommendation: For Phase 2, keep the simpler local-device model and allow replacing the PIN from an already unlocked session.

2. **Should reminder scheduling preserve a previous time automatically when re-enabled?**
   - What we know: the store already persists `reminderTime`, and current UX breaks because re-enabling does not reschedule it.
   - What's unclear: whether the preferred UX is immediate reschedule or always re-open the picker.
   - Recommendation: If a valid stored time exists, reschedule immediately; only open the picker when no valid time exists.

3. **Does locale setup need more product changes beyond regression coverage?**
   - What we know: onboarding and later locale settings are already implemented with shared code.
   - What's unclear: whether there are hidden device-level issues outside the current code review.
   - Recommendation: Treat locale as a verification-heavy plan first and only expand scope if failing tests or manual checks surface a concrete problem.
</open_questions>

<sources>
## Sources

### Repo-grounded sources
- [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- [`src/screens/onboarding/LocaleSetupFlow.tsx`](/Users/dev/Projects/EveryBible/src/screens/onboarding/LocaleSetupFlow.tsx)
- [`src/screens/onboarding/localeSetupModel.ts`](/Users/dev/Projects/EveryBible/src/screens/onboarding/localeSetupModel.ts)
- [`src/screens/more/SettingsScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/more/SettingsScreen.tsx)
- [`src/screens/more/LocalePreferencesScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/more/LocalePreferencesScreen.tsx)
- [`src/services/onboarding/localeSelection.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/localeSelection.ts)
- [`src/services/onboarding/interfaceLanguageSelection.ts`](/Users/dev/Projects/EveryBible/src/services/onboarding/interfaceLanguageSelection.ts)
- [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- [`src/stores/privacyStore.ts`](/Users/dev/Projects/EveryBible/src/stores/privacyStore.ts)
- [`src/services/privacy/privacyService.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyService.ts)
- [`src/hooks/usePrivacyLock.ts`](/Users/dev/Projects/EveryBible/src/hooks/usePrivacyLock.ts)
- [`src/navigation/MoreStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/MoreStack.tsx)
- [`src/navigation/types.ts`](/Users/dev/Projects/EveryBible/src/navigation/types.ts)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Expo onboarding/settings, local notifications, SecureStore privacy mode
- Patterns: shared flow by mode, pure decision helpers, local-only privacy management
- Pitfalls: locale regressions without tests, reminder schedule drift, missing privacy settings parity

**Confidence breakdown:**
- Existing locale architecture: HIGH - already implemented and easy to trace in source
- Reminder gap analysis: HIGH - directly visible in `SettingsScreen`
- Privacy settings gap analysis: HIGH - privacy exists but is absent from settings navigation
- Manual device behavior: MEDIUM - still requires on-device confirmation

**Research date:** 2026-03-11
**Valid until:** 2026-04-10
</metadata>

---

*Phase: 02-onboarding-and-preference-cohesion*
*Research completed: 2026-03-11*
*Ready for planning: yes*
