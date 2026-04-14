# TestFlight Build Visibility Playbook

Use this when a build has uploaded, but testers still cannot see it in TestFlight.

## 0. First question: is the build missing, or was the upload rejected?

Before debugging groups, testers, or beta review, check whether the new upload actually made it into App Store Connect.

Check EAS submission state:

```bash
# If you submitted with eas submit, inspect that submission first
# (use the exact submission id from the eas submit output)
```

Check raw App Store Connect upload state:

```bash
asc builds uploads list --app 6758254335 --output json
```

Interpretation:
- if the upload record is `FAILED`, this is not a TestFlight visibility problem
- if the upload record is `PROCESSING`, wait for App Store Connect to create the build record
- if the build record is present and `VALID`, then move on to group/tester distribution checks

Common rejection to recognize immediately:
- `ITMS-90186: Invalid Pre-Release Train`
- `ITMS-90062: CFBundleShortVersionString ... must contain a higher version`

That pair means Apple closed the old marketing-version train. Do not wait on TestFlight. Rebuild with a higher `CFBundleShortVersionString`.

## 1. Confirm the build is actually in App Store Connect

```bash
asc builds list --app 6758254335 --sort -uploadedDate --limit 10 --output json
```

Check:
- the build number is present
- `processingState` is `VALID`
- `usesNonExemptEncryption` is `false`

If the build is not present, this is an upload/build issue, not a TestFlight distribution issue.

## 2. Confirm export compliance is not the blocker

This app already declares non-exempt encryption as false in:
- `/Users/dev/Projects/EveryBible/app.json`

Relevant setting:

```json
"ios": {
  "infoPlist": {
    "ITSAppUsesNonExemptEncryption": false
  }
}
```

If ASC shows `usesNonExemptEncryption=false`, export compliance is already satisfied for that build.

## 3. Check TestFlight beta state

```bash
asc testflight beta-details get --build BUILD_ID --output json
```

Interpretation:
- `internalBuildState=READY_FOR_BETA_TESTING`
  - build can be used internally, but may still need to be attached to testers/groups
- `externalBuildState=READY_FOR_BETA_SUBMISSION`
  - external testers will not see it yet
- `externalBuildState=IN_BETA_TESTING`
  - external review/distribution is active

## 4. Check whether the build is attached to the correct beta groups

List groups:

```bash
asc testflight beta-groups list --app 6758254335 --output json
```

Check group build relationships:

```bash
asc testflight beta-groups relationships get --group-id GROUP_ID --type builds --paginate --output json
```

For this app:
- Internal Testers: `3a75b4d5-cae0-4c9a-8880-890f486f605a`
- External Testers: `f32e3138-d64b-4d40-9337-18a3a9096010`

## 5. Attach the build to the intended groups

```bash
asc builds add-groups --build BUILD_ID --group INTERNAL_GROUP_ID,EXTERNAL_GROUP_ID
```

Example used for build `113`:

```bash
asc builds add-groups \
  --build fc5b0cee-1e9e-41a1-b02f-3c89654c3889 \
  --group 3a75b4d5-cae0-4c9a-8880-890f486f605a,f32e3138-d64b-4d40-9337-18a3a9096010
```

## 6. Add a direct tester fallback for internal visibility

If internal visibility is urgent or group state is ambiguous, attach the build directly to the internal tester too.

List testers:

```bash
asc testflight beta-testers list --app 6758254335 --output json
```

Attach build directly:

```bash
asc testflight beta-testers add-builds --id TESTER_ID --build BUILD_ID
```

Example used:

```bash
asc testflight beta-testers add-builds \
  --id e378ad42-c381-460b-9e06-b4180b938807 \
  --build fc5b0cee-1e9e-41a1-b02f-3c89654c3889
```

## 7. Submit the build for external beta review

If external testers cannot see the build and `externalBuildState` is `READY_FOR_BETA_SUBMISSION`, submit it:

```bash
asc testflight review submit --build BUILD_ID --confirm --output json
```

Example used:

```bash
asc testflight review submit \
  --build fc5b0cee-1e9e-41a1-b02f-3c89654c3889 \
  --confirm
```

## 8. Re-verify after repair

Check build beta state again:

```bash
asc testflight beta-details get --build BUILD_ID --output json
```

Check group linkage again:

```bash
asc testflight beta-groups relationships get --group-id GROUP_ID --type builds --paginate --output json
```

Check direct tester linkage again:

```bash
asc testflight beta-testers builds list --tester-id TESTER_ID --output json
```

## Known-good outcome

For build `113`, the repaired state was:
- build ID: `fc5b0cee-1e9e-41a1-b02f-3c89654c3889`
- `processingState=VALID`
- `internalBuildState=IN_BETA_TESTING`
- `externalBuildState=IN_BETA_TESTING`
- attached to `Internal Testers`
- attached to `External Testers`
- directly attached to `curryj@protonmail.com`

## Root cause from this incident

Two different incidents produced the same user-visible symptom: "the build is missing in TestFlight."

### Incident A — distribution linkage was missing

The build itself was valid, but:
- it was not attached to the needed beta groups/testers
- and external review had not been submitted yet

That combination makes the build look missing in TestFlight even though ASC already shows it as a valid build.

### Incident B — the upload was rejected before TestFlight ever saw it

Build `336` for marketing version `1.0.0` never surfaced because Apple rejected it during upload ingestion:
- `ITMS-90186: Invalid Pre-Release Train`
- `ITMS-90062: CFBundleShortVersionString [1.0.0] must be higher than the previously approved version [1.0.0]`

The actual issue was:
- app version `1.0.0` had already been approved/distributed
- the `1.0.0` pre-release train was closed for new submissions
- the binary still used `CFBundleShortVersionString = 1.0.0`
- so Apple rejected the upload before it became a build record

The fix was:
- bump the marketing version to `1.0.1`
- keep build numbering aligned with the latest accepted ASC build
- rebuild locally
- resubmit
- then wait for the new upload to reach `PROCESSING` and `VALID`

### Future rule

If a new build is not visible quickly:
1. Check EAS submission state
2. Check `asc builds uploads list`
3. Only debug TestFlight groups/testers after confirming the build record exists and is `VALID`
