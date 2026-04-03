# Quick Task 260403-fkc Plan: Finish the Android Play Store release path

## Objective

Close the Android release loop by making the manual upload artifact available and proving the GitHub Actions release workflow can build and optionally submit a production Android bundle.

## Scope

- `.github/workflows/android-production-release.yml`
- `eas.json`
- `README.md`
- `CLAUDE.md`
- `.gitignore`
- `.planning/STATE.md`
- `.planning/quick/260403-fkc-finish-the-android-play-store-release-pa/*`

## Tasks

### Task 1: Confirm the manual upload artifact

Verify the existing production `.aab` is present and ready for the first Play Console upload.

### Task 2: Publish the release workflow changes

Commit only the release-related files and push them so GitHub Actions can see the new workflow.

### Task 3: Trigger and inspect the workflow

Run the Android production release workflow on GitHub, confirm it builds successfully, and check whether the optional submit path is wired correctly.

### Task 4: Record the quick task

Update the quick-task summary and the GSD completed-tasks table once the workflow result is known.

## Verification

- `file build-1775189399117.aab`
- `gh workflow list -R jeremy3004-dot/EveryBible`
- `gh run list -R jeremy3004-dot/EveryBible`
- `gh run watch <run-id> -R jeremy3004-dot/EveryBible`
