# Plan 35-03 Summary

- Updated More and Profile guest CTAs to launch the shared auth flow with benefit-led copy.
- Added just-in-time sign-in prompts to the group preview and prayer wall surfaces so account-bound actions route intentionally into auth.
- Kept guest-safe reading and browsing flows untouched.
- Updated the release smoke checklist to cover guest-first onboarding and unified-auth re-entry.

## Verification

- `node --test --import tsx src/screens/more/moreScreenSource.test.ts`
- `npm run release:verify`
