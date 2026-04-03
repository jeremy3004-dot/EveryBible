# Quick Task 260403-fkc Context: Finish the Android Play Store release path

## User Request

- produce a manual Android `.aab` for the first Google Play Console upload
- trigger the GitHub Actions release workflow and confirm it is wired correctly
- keep the setup usable for the new `jeremy@everylanguage.com` Google developer account

## Current State

- `eas.json` now targets the Google Play `production` track for Android submission
- the GitHub Actions workflow exists locally at `.github/workflows/android-production-release.yml`
- `EXPO_TOKEN` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` are already set in GitHub secrets
- a local production AAB already exists at `build-1775189399117.aab`
- the repo still has many unrelated working-tree changes, so this task must stay scoped to the release files

## Constraints

- do not disturb unrelated local edits
- do not commit the secret JSON file or the generated AAB
- preserve `draft` release status so Google Play does not auto-publish on first upload
- only trigger GitHub Actions once the workflow file is present on the remote branch
