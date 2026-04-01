# EveryBible Codex Notes

## Release Rule

- For iOS TestFlight releases, prefer `eas build --platform ios --profile production --local` first.
- This project can use remote Expo-managed iOS credentials during a local EAS build.
- Missing local signing files such as `credentials.json`, `.p12`, and `.mobileprovision` are not a release blocker unless the release path explicitly requires manual local signing.

## Practical Flow

1. Build locally with EAS production profile.
2. Allow EAS to resolve remote iOS credentials if available.
3. Only switch to manual local credentials if remote credential resolution fails or the release flow explicitly demands it.
