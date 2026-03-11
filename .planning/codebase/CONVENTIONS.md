# Conventions

## General Style

- The codebase uses TypeScript across app logic and React components
- Functional React components and hooks are the default style
- Domain logic is usually extracted into service modules rather than embedded deeply in UI components
- Barrel exports are used for many folders through `index.ts`

## React And State Patterns

- Global state uses Zustand slices instead of Redux or Context-heavy state
- Persisted slices typically use `persist(...)` with `createJSONStorage(...)`
- Store modules expose:
- state fields
- imperative actions
- derived getters
- Some services read or update stores via `useStore.getState()` rather than passing dependencies explicitly

## Startup And Side-Effect Patterns

- Critical startup work is intentionally orchestrated through [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts)
- Heavy warmup work is deferred instead of happening at module import time
- External clients are lazily initialized where possible, notably Supabase in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)

## Styling And Theming

- Styling uses React Native `StyleSheet` and theme-driven color tokens
- Theme access is centralized through [`src/contexts/ThemeContext.tsx`](/Users/dev/Projects/EveryBible/src/contexts/ThemeContext.tsx)
- Components normally pull colors from `useTheme()` rather than hardcoding view-level palette values

## Localization

- Text is routed through i18next
- Locale resources live in [`src/i18n/locales/`](/Users/dev/Projects/EveryBible/src/i18n/locales)
- Screens and components commonly use `useTranslation()` instead of inline strings
- Locale-selection logic is separated into onboarding services in [`src/services/onboarding/`](/Users/dev/Projects/EveryBible/src/services/onboarding)

## Error Handling

- App-level error handling is mostly pragmatic:
- `try/catch` around async service work
- `console.error(...)` or `console.warn(...)` for diagnostics
- feature methods often return `{ success, error }` objects or throw `Error`
- Auth code maps provider and backend failures into app-specific error codes in [`src/services/auth/authErrors.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authErrors.ts)

## Validation And Sanitization

- Persisted client state is normalized through explicit sanitizer helpers in [`src/stores/persistedStateSanitizers.ts`](/Users/dev/Projects/EveryBible/src/stores/persistedStateSanitizers.ts)
- Privacy input is validated before storage in [`src/services/privacy/privacyMode.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyMode.ts)
- Google auth configuration is resolved defensively in [`src/services/auth/googleSignIn.ts`](/Users/dev/Projects/EveryBible/src/services/auth/googleSignIn.ts)
- Group join codes are normalized to uppercase in [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts)

## File And Naming Conventions

- `*Screen.tsx` for routed screens
- `*Store.ts` for Zustand slices
- `*Service.ts` for higher-level service entrypoints
- `*.test.ts` for colocated unit tests
- `index.ts` files re-export module surfaces

## Dependency Management Conventions

- Feature dependencies are kept relatively small and direct; there is little abstraction for its own sake
- The app prefers Expo-managed capabilities instead of custom native modules where possible
- Config lives in repo-level files rather than per-feature config objects

## Behavior Conventions Worth Preserving

- Guard remote-dependent features when env configuration is missing
- Keep Bible content available offline first
- Defer non-critical boot work until after first render / interactions
- Preserve local data if cloud sync is unavailable

## Areas With Mixed Conventions

- Lint config exists in both [`eslint.config.js`](/Users/dev/Projects/EveryBible/eslint.config.js) and [`.eslintrc.js`](/Users/dev/Projects/EveryBible/.eslintrc.js)
- Some service APIs throw, while others return result objects; future work should keep call-site expectations explicit
- Group study code spans local-state and backend-service patterns, so conventions are not fully unified there yet
