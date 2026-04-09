# Signup Simplification Design

**Date:** 2026-04-09  
**Related GSD phase:** `35-signup-simplification-and-deferred-auth-conversion`

## Goal

Make EveryBible easier to enter and easier to authenticate into:
- no auth detour during first-run locale setup
- one shared auth surface instead of split sign-in and sign-up shells
- auth prompts shown at the moment sync or account identity actually matter

## Current friction

Today the app asks the user to choose `Sign in`, `Create account`, or `Guest` during onboarding, but that choice does not finish auth. Initial onboarding completes first, then `App.tsx` routes into a separate auth flow. That makes the first-run journey feel longer and less honest than it needs to be.

The auth UI itself is also split into two near-duplicate screens. The sign-up version asks for `name`, `email`, `password`, and `confirm password`, which creates a lot of upfront effort before the user has seen enough value to justify it.

## Target flow

### 1. First run
- User picks interface language
- User picks country
- User picks content language
- User enters the app as a guest

No account choice appears in onboarding.

### 2. In-app guest state
- More/Profile show a clear guest state with benefit-led copy like "Sync your progress"
- The user can continue reading and exploring without interruption

### 3. When auth is needed
- Opening the auth flow from guest surfaces or account-bound actions shows one shared auth screen
- Apple/Google are primary options
- Email is the fallback path

### 4. Email auth
- `Sign in`: email + password
- `Create account`: email + password only
- Display name is collected later in profile
- Account creation uses a calmer in-flow success state instead of an abrupt alert when possible

## Non-goals

- No provider or backend reconfiguration
- No passwordless or magic-link rollout
- No broad rewrite of local-first product behavior
- No large settings or privacy redesign beyond what the auth-entry cleanup needs

## Execution split

1. `35-01` removes the onboarding auth detour and makes first run guest-first.
2. `35-02` replaces split sign-in/sign-up with one auth surface.
3. `35-03` adds just-in-time auth entry points and verification coverage.
