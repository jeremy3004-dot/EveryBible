# EveryBible Release and Operations Runbook

**Last Updated:** April 2026  
**Audience:** Engineers executing releases and operations procedures  
**Scope:** iOS TestFlight, Android Play Store, Bible data, Supabase, audio imports, deployments

This runbook contains step-by-step procedures for all major release and operational tasks. Each section is self-contained with exact commands, expected outputs, and troubleshooting.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [iOS TestFlight Release (Mandatory 4-Step Flow)](#ios-testflight-release-mandatory-4-step-flow)
3. [Android Production Release](#android-production-release)
4. [Diagnosing Missing Builds](#diagnosing-missing-builds)
5. [Bible Data Updates](#bible-data-updates)
6. [Audio Bible Imports](#audio-bible-imports)
7. [Website Deployments](#website-deployments)
8. [Supabase Operations](#supabase-operations)
9. [Emergency Procedures](#emergency-procedures)

---

## Quick Reference

| Task | Command | When to Use |
|------|---------|------------|
| Pre-flight checks | `npm run release:prepare` | Before any build |
| Build iOS locally | `npm run testflight:build-local` | iOS TestFlight submission |
| Submit & verify iOS | `npm run testflight:submit-and-verify` | After local build succeeds |
| Build Android | `eas build --platform android --profile production --local` | Android Play Store submission |
| Verify app state | `npm run release:verify` | Lint, typecheck, release tests |
| Reset iOS simulator | `xcrun simctl erase all` | When simulator is broken |
| Clear Expo cache | `npx expo start -c` | Metro bundler issues |
| Push Supabase migrations | `supabase db push` | After schema changes |

---

## iOS TestFlight Release (Mandatory 4-Step Flow)

### Overview

iOS releases follow a **4-step TestFlight distribution procedure**. `eas submit` only uploads the binary; the build is **invisible to ALL testers** until all 4 steps complete. This mistake has been made 4 times (builds 113, 115, 138, 142). Do not skip.

**Default for "ship it":** Land on `main`, then Internal Testers only. Do not mark a release done until the build is attached to the `Internal Testers` group and verified visible in TestFlight.

### Step 0: Pre-Flight Checks

Before building, verify the repository state and release metadata.

**Command:**

```bash
npm run release:prepare
```

This runs:
1. `npm run lint` — ESLint code quality checks
2. `npm run typecheck` — TypeScript strict-mode type checking
3. `npm run verify:expo-config` — Expo config validity
4. Release metadata tests (runtime config, signing, guard model)
5. `npm run test:release` — Focused regression test suite

**Expected output:**
```
✓ All files match the Prettier code style
✓ Found 0 ESLint errors or warnings
✓ Successfully checked TypeScript compilation
✓ Expo config is valid
✓ Release metadata tests passed
✓ testflight_release_guard.ts validation passed
```

**If any step fails:**
- Fix the error (usually lint/format/typecheck)
- Re-run the failing command in isolation
- Do not proceed to build until all pass

**Common failures:**
- `ESLint: Unexpected console.log` → Remove debug logs
- `TypeScript: Type 'any' is not allowed` → Add proper types
- `Release guard failed: EAS remote build number mismatch` → Run `npm run testflight:sync-version` and rebuild

### Step 1: Build Locally (Sync Version + EAS Build)

Build the iOS app locally with Expo-managed credentials. This syncs the remote EAS build number into native code before the build, ensuring TestFlight receives the correct `CFBundleVersion`.

**Command:**

```bash
npm run testflight:build-local
```

This runs:
1. `npm run testflight:sync-version` — Pulls EAS remote iOS build number and updates `app.json`
2. `eas build --platform ios --profile production --local --non-interactive` — Builds IPA file locally

**Expected output:**
```
Build synced to EAS remote build number: 145
Successfully created local build: /path/to/everybible/app-1.0.0-145.ipa
```

**The IPA file location:**
- Look for `.ipa` in the project root directory
- File naming: `app-{marketingVersion}-{buildNumber}.ipa` or similar
- Size: typically 80-130 MB

**If the build fails:**

| Error | Cause | Fix |
|-------|-------|-----|
| `No provisioning profile found` | Expo credentials expired | Run `eas credentials`, select iOS, and re-authenticate |
| `CFBundleVersion mismatch` | Build number out of sync | Run `npm run testflight:sync-version` and retry |
| `CocoaPods install failed` | iOS native dependencies broken | `cd ios && pod install && cd .. && npm run testflight:build-local` |
| `xcode-select: error` | Xcode not installed or path wrong | `xcode-select --install` or `xcode-select --reset` |
| `Metro bundler timeout` | Node process out of memory | Clear cache: `npx expo start -c` before retrying |

**Credentials management:**

The app uses **Expo-managed remote iOS credentials** by default. Local signing artifacts (`.p12`, `.mobileprovision`) are **not required** for TestFlight releases unless the credentials explicitly expire.

If you see "Missing local credentials" warnings: ignore them. EAS will fetch from Expo's remote credential store automatically.

### Step 2: Pre-Check the IPA

Validate the built IPA before submission.

**Command:**

```bash
bash scripts/testflight_precheck.sh /path/to/app-1.0.0-145.ipa
```

**Expected output:**
```
Checking IPA: /path/to/app-1.0.0-145.ipa
✓ IPA file exists and is readable
✓ Bundle ID is correct: com.everybible.app
✓ Build number: 145
✓ Marketing version: 1.0.0
✓ CFBundleVersion matches EAS build number
✓ All required frameworks present
✓ Code signing present
Ready for TestFlight submission
```

**If precheck fails:**

| Error | Cause | Fix |
|-------|-------|-----|
| `CFBundleVersion mismatch` | Build number doesn't match | Version mismatch between EAS and IPA. Delete IPA and rebuild. |
| `Invalid code signing` | Signing certificate expired | Run `eas credentials` and select "revoke and rebuild" |
| `Bundle ID mismatch` | Wrong bundle ID in IPA | Check `app.json` `ios.bundleIdentifier` matches `com.everybible.app` |

### Step 3: Submit to App Store Connect

Upload the IPA to App Store Connect. This uses your credentials from `eas.json`.

**Command:**

```bash
eas submit --platform ios --profile production --path /path/to/app-1.0.0-145.ipa --non-interactive --no-wait
```

**Expected output:**
```
Submitting iOS build to App Store Connect...
✓ Upload successful
Submission ID: ABC-123-DEF
Build is now processing on App Store Connect...
Visit https://appstoreconnect.apple.com/apps/6758254335 to monitor
```

**Note on `--no-wait`:** EAS returns immediately after upload. The build will take 5-10 minutes to process on App Store Connect before it appears in TestFlight.

**If submission fails:**

| Error | Cause | Fix |
|-------|-------|-----|
| `ITMS-90186: Invalid Pre-Release Train` | Marketing version train closed | Marketing version already distributed. Bump `CFBundleShortVersionString` in `app.json` and rebuild. |
| `ITMS-90062: CFBundleShortVersionString must be higher` | Version too low | Same fix: bump marketing version. |
| `Authentication failed` | Apple ID credentials stale | Run `eas credentials` and re-authenticate with Apple ID |
| `Invalid provisioning profile` | Cert/profile mismatch | Run `eas credentials` and revoke/rebuild |

**Credentials used for submission:**

From `eas.json` `submit.production.ios`:
```json
{
  "appleId": "curryj@protonmail.com",
  "ascAppId": "6758254335",
  "appleTeamId": "NVC9N47PRH"
}
```

### Step 4: Verify Distribution (4-Step Mandatory Flow)

After submission, the build is **invisible to testers** until you complete this verification step. This is the most commonly skipped step, causing "build missing in TestFlight" incidents.

**Automated verification:**

```bash
npm run testflight:submit-and-verify
```

This is a convenience wrapper that:
1. Polls until `processingState=VALID` (~5-10 min after upload)
2. Attaches the build to the Internal Testers beta group
3. Verifies the build appears in the group
4. Reports the result

**Expected output:**
```
Waiting for build to finish processing...
[Polling every 30s...]
✓ Build processing complete (VALID)
✓ Build attached to Internal Testers group
✓ Build is now visible to internal testers
TestFlight distribution complete: Build 145 is ready for testing
```

**Manual verification (if automated script is not available):**

If you need to verify manually, use these steps:

#### 4a. Poll Until `processingState=VALID`

```bash
asc builds list --app 6758254335 --sort -uploadedDate --limit 1 --output json
```

Check the `processingState` field:
- `PROCESSING` — still uploading, wait and retry in 30 seconds
- `VALID` — ready for TestFlight distribution, proceed to step 4b
- `INVALID` — upload rejected, check the error code

**Expected output (VALID state):**
```json
{
  "id": "abc123def456",
  "buildNumber": "145",
  "uploadedDate": "2026-04-15T14:30:00Z",
  "processingState": "VALID",
  "usesNonExemptEncryption": false
}
```

#### 4b. Attach to Internal Testers Beta Group

Get the Internal Testers group ID:

```bash
asc testflight beta-groups list --app 6758254335 --output json | grep -A5 "Internal Testers"
```

Expected output:
```json
{
  "id": "3a75b4d5-cae0-4c9a-8880-890f486f605a",
  "name": "Internal Testers"
}
```

Attach the build to the group:

```bash
asc builds add-groups \
  --build abc123def456 \
  --group 3a75b4d5-cae0-4c9a-8880-890f486f605a
```

**Expected output:**
```
✓ Build attached to Internal Testers group
```

#### 4c. Verify Build Appears in Group

Check that the build is now linked to the Internal Testers group:

```bash
asc testflight beta-groups relationships get \
  --group-id 3a75b4d5-cae0-4c9a-8880-890f486f605a \
  --type builds \
  --output json | grep "145"
```

**Expected output:**
```json
{
  "buildNumber": "145",
  "uploadedDate": "2026-04-15T14:30:00Z"
}
```

If build number `145` appears, the build is attached successfully.

#### 4d. (Optional) External Testers

If you want external testers to also see the build:

```bash
asc builds add-groups \
  --build abc123def456 \
  --group f32e3138-d64b-4d40-9337-18a3a9096010

asc testflight review submit --build abc123def456 --confirm
```

This attaches the build to the External Testers group and submits it for beta review.

### iOS Release Complete

Once Step 4 completes successfully:
- Internal testers can download the build from TestFlight
- The build is visible in App Store Connect under TestFlight → Builds
- If you see it in the TestFlight app or web, the release is live to internal testers

**Do not move forward with external release or production submission** until you have verified the build is visible to internal testers.

---

## Android Production Release

### Automated Release (CI)

Android releases use GitHub Actions for CI automation. Pushes to `main` trigger the release workflow.

**Workflow:** `.github/workflows/android-production-release.yml`

**Trigger:**
```bash
git push origin main
```

**What the workflow does:**
1. Builds AAB via `eas build --platform android --profile production`
2. Uploads AAB as a GitHub artifact
3. (Optional) Submits to Google Play if `submit=true` dispatch flag is set

**To monitor the build:**
1. Go to GitHub → EveryBible repository → Actions
2. Find the "Android Production Release" workflow run
3. Check logs for build status

**Expected workflow output:**
```
✓ Android build completed successfully
✓ AAB uploaded to GitHub artifacts
✓ Build URL: https://github.com/.../releases/download/...
```

### Manual Android Release

If you need to build or submit manually:

**Build:**

```bash
eas build --platform android --profile production --local --non-interactive
```

**Expected output:**
```
Building Android app...
✓ Android production build succeeded
✓ AAB file: /path/to/app-release.aab
```

**Submit to Play Store:**

Requires `google-play-service-account.json` (not committed, but should be available locally or in CI secrets).

```bash
eas submit --platform android --profile production --path /path/to/app-release.aab
```

**Expected output:**
```
Submitting Android build to Google Play...
✓ Upload successful
Build is now in Play Console as a draft in the production track
Visit https://play.google.com/console to review and roll out
```

### Android Play Store Configuration

**App details:**
- Package: `com.everybible.app`
- Track: `production` (uploaded as draft, not auto-released)
- Release status: `draft` (from `eas.json`)

**Service account:**
- File: `google-play-service-account.json`
- Not committed to repo (security)
- Should be stored in CI secrets or local environment

**To obtain the service account:**
1. Go to https://play.google.com/console
2. Settings → API and services → Service account
3. Create or download the JSON key
4. Store securely (CI secrets or local .env)

### Android Build Number Management

Build numbers auto-increment per `eas.json`:

```json
{
  "build": {
    "production": {
      "autoIncrement": true
    }
  }
}
```

Each Android production build automatically increments the version code. No manual intervention needed.

---

## Diagnosing Missing Builds

Use this when a build has uploaded but testers cannot see it in TestFlight.

### Step 1: Is the Build Missing or Was Upload Rejected?

Check whether the new upload actually made it into App Store Connect.

**Check EAS submission state:**

```bash
# If you submitted with eas submit, inspect that submission
eas submit:log --platform ios
```

**Check App Store Connect upload state:**

```bash
asc builds uploads list --app 6758254335 --output json
```

**Interpretation:**
- Upload record is `FAILED` → This is not a TestFlight visibility problem, it's an upload problem. Check the failure reason.
- Upload record is `PROCESSING` → Wait for App Store Connect to create the build record (5-10 min).
- Build record is present and `VALID` → The build is in ASC, move to Step 2 (distribution checks).

**Common rejection codes to recognize immediately:**
- `ITMS-90186: Invalid Pre-Release Train` — Marketing version train closed
- `ITMS-90062: CFBundleShortVersionString must contain a higher version` — Version number too low

If you see this pair, the marketing version was already distributed and Apple closed the pre-release train. **Do not wait on TestFlight.** Bump `CFBundleShortVersionString` in `app.json`, rebuild, and resubmit.

### Step 2: Confirm Build is in App Store Connect

```bash
asc builds list --app 6758254335 --sort -uploadedDate --limit 10 --output json
```

**Check:**
- Build number is present in the list
- `processingState` is `VALID` (not `PROCESSING` or `INVALID`)
- `usesNonExemptEncryption` is `false`

**If the build is missing entirely,** this is an upload/build issue, not a TestFlight distribution issue. Go back to Step 1.

### Step 3: Check TestFlight Beta State

```bash
asc testflight beta-details get --build BUILD_ID --output json
```

**Interpretation:**
- `internalBuildState=READY_FOR_BETA_TESTING` → Build can be used internally, but may not be attached to testers/groups
- `externalBuildState=READY_FOR_BETA_SUBMISSION` → External testers will not see it yet
- `externalBuildState=IN_BETA_TESTING` → External review/distribution is active

### Step 4: Check Build is Attached to Beta Groups

List beta groups:

```bash
asc testflight beta-groups list --app 6758254335 --output json
```

Check which builds are attached to Internal Testers:

```bash
asc testflight beta-groups relationships get \
  --group-id 3a75b4d5-cae0-4c9a-8880-890f486f605a \
  --type builds \
  --paginate \
  --output json
```

**If your build is not in the list,** it's not attached. Go to Step 5.

### Step 5: Attach Build to Internal Testers Group

```bash
asc builds add-groups \
  --build BUILD_ID \
  --group 3a75b4d5-cae0-4c9a-8880-890f486f605a
```

**Expected output:**
```
✓ Build attached to Internal Testers group
```

### Step 6: Re-Verify After Repair

Check build beta state again:

```bash
asc testflight beta-details get --build BUILD_ID --output json
```

Check group linkage:

```bash
asc testflight beta-groups relationships get --group-id 3a75b4d5-cae0-4c9a-8880-890f486f605a --type builds --output json
```

**Known-good outcome (for a successfully distributed build):**
- `processingState=VALID`
- `internalBuildState=IN_BETA_TESTING`
- Build appears in Internal Testers group builds list
- Build is downloadable from TestFlight app

### Common Build Visibility Incidents

**Incident A: Distribution linkage was missing**

The build was valid, but not attached to beta groups/testers.

**Fix:** Use Step 5 (`asc builds add-groups`) to attach.

**Incident B: Upload was rejected before TestFlight saw it**

The upload itself was rejected by Apple during ingestion, so no build record was created.

**Symptoms:**
- `asc builds uploads list` shows upload status `FAILED`
- `asc builds list` does not show your build at all
- `ITMS-90186` or `ITMS-90062` error in upload details

**Fix:**
1. Bump marketing version in `app.json` (e.g., `1.0.0` → `1.0.1`)
2. Keep build number aligned with latest accepted ASC build
3. Rebuild locally
4. Resubmit

**Incident C: Build number mismatch**

Your local IPA's build number doesn't match what EAS remote shows.

**Fix:** Run `npm run testflight:sync-version` before building.

---

## Bible Data Updates

### Rebuilding the Bundled Database

The bundled Bible database (`bible-bsb-v2.db`) is embedded in the app at build time. When you update Bible data, you must rebuild the database and update version constants to trigger re-import on existing devices.

**Step 1: Rebuild the Database**

```bash
python3 scripts/build_bible_db.py
```

**Expected output:**
```
Processing BSB...
Processing WEB...
Processing ASV...
✓ Database built: data/bible-bsb-v2.db (12.5 MB)
✓ Index created: FTS5 full-text search
✓ Schema version set to: 42
```

**Step 2: Update Version Constants (CRITICAL)**

Failing to update all three version constants causes new translations to be invisible on existing installs.

Update these three files in the same commit:

#### 2a. Update PRAGMA user_version in the Database

The `build_bible_db.py` script sets `PRAGMA user_version`. Confirm it matches what you'll set in code (typically `42`, `43`, `44`, etc.).

```bash
sqlite3 data/bible-bsb-v2.db "PRAGMA user_version;"
```

**Output:** Version number (e.g., `6`)

#### 2b. Update BUNDLED_BIBLE_SCHEMA_VERSION

File: `src/services/bible/bibleDataModel.ts`

```typescript
// Old
export const BUNDLED_BIBLE_SCHEMA_VERSION = 6;

// New (matching the database PRAGMA user_version)
export const BUNDLED_BIBLE_SCHEMA_VERSION = 7;
```

#### 2c. Update DEFAULT_MINIMUM_READY_VERSE_COUNT

File: `src/services/bible/bibleDatabase.ts`

This constant controls how many verses must be present before the database is considered "ready." Update it to the total verse count after your rebuild.

```typescript
// Old
export const DEFAULT_MINIMUM_READY_VERSE_COUNT = 90001;

// New (if you added verses — verify with query below)
export const DEFAULT_MINIMUM_READY_VERSE_COUNT = 90005;
```

**How to find the correct verse count:**

```bash
sqlite3 data/bible-bsb-v2.db "SELECT COUNT(*) FROM verses;"
```

#### 2d. Verify the Database

```bash
npm run verify:bible-db
```

**Expected output:**
```
✓ Database file exists
✓ Schema version is correct (42)
✓ Verse count matches expected (31086)
✓ FTS5 index is present
✓ All tables are present
Database verification passed
```

**Step 3: Commit All Three Changes Together**

```bash
git add data/bible-bsb-v2.db src/services/bible/bibleDataModel.ts src/services/bible/bibleDatabase.ts
git commit -m "Update Bible database schema v42 with new translations"
```

**Why this matters:**

The `ensureBundledDatabaseReady()` function in `bibleDatabase.ts` checks:
1. Current database `PRAGMA user_version`
2. Stored `BUNDLED_BIBLE_SCHEMA_VERSION` in code
3. Current verse count vs `DEFAULT_MINIMUM_READY_VERSE_COUNT`

If the version constants don't match the database, existing devices will skip the re-import, leaving the new data invisible.

### Adding a New Translation

**Step 1: Prepare Source Data**

Create a JSON file with the translation text. Format:

```json
{
  "translation_id": "asv",
  "language": "English",
  "verses": [
    {
      "book": 1,
      "chapter": 1,
      "verse": 1,
      "text": "In the beginning God created the heavens and the earth."
    }
  ]
}
```

Save to `data/{translation_code}_processed.json`.

**Step 2: Add to Build Script**

File: `scripts/build_bible_db.py`

```python
# Add to the translations list
TRANSLATIONS = [
    ('data/bsb_processed.json', 'bsb', 'BSB'),
    ('data/web_processed.json', 'web', 'WEB'),
    ('data/asv_processed.json', 'asv', 'ASV'),
    ('data/your_new_translation_processed.json', 'your_code', 'Your Translation Name'),
]
```

**Step 3: Rebuild the Database**

```bash
python3 scripts/build_bible_db.py
```

**Step 4: Update All Three Version Constants**

See "Step 2: Update Version Constants" above. This is the same process regardless of whether you're updating existing translations or adding new ones.

**Step 5: Update Translation Catalog**

The app needs to know which translations exist. Update the catalog:

```bash
npm run catalog:translation
```

**Step 6: Test on Both Platforms**

Build and install on iOS and Android simulators/devices:

```bash
npm run ios
npm run android
```

Verify the new translation is visible in the translation picker and that verses display correctly.

### Multi-Translation Architecture

**Bundled translations:**
- BSB, WEB, ASV are bundled in `bible-bsb-v2.db`
- Always offline, no download needed
- FTS5 full-text search included

**Downloaded translations:**
- Additional translations are downloaded as separate SQLite files
- Downloaded via `cloudTranslationService.ts`
- State machine: `seeded` → `downloading` → `verifying` → `installing` → `installed`
- Downloaded translations do NOT have FTS5 index (iOS crash workaround)
- Downloaded in pages of 5,000 verses, batch written 500 at a time

**Translation lookup:**

Case-insensitive translation IDs from Supabase:

```typescript
const translationId = resolveSupabaseTranslationId('asv'); // 'asv' or 'ASV' both work
```

---

## Audio Bible Imports

### Importing Open Bible Audio

The app can import open-source Bible audio from eBible.org.

**Basic import:**

```bash
npm run import:open-bible-audio -- \
  --source-url https://open.bible/bibles/nepali-davar-audio-nt/ \
  --translation npiulb \
  --staging-root tmp/open-bible-import/npiulb
```

**Parameters:**
- `--source-url` — eBible.org or open.bible URL with audio files
- `--translation` — Translation code (e.g., `npiulb`, `engweb`)
- `--staging-root` — Temporary directory for import staging
- `--clean` — Remove staging directory after import (optional)
- `--jobs 3` — Parallel download jobs (default: 1)

**Expected output:**
```
Downloading audio from https://open.bible/bibles/nepali-davar-audio-nt/
✓ Downloaded 27 chapter files (npiulb)
✓ Staged to tmp/open-bible-import/npiulb
✓ Ready for R2 upload
```

### Uploading Audio to Cloudflare R2

After importing, upload the audio files to R2 (CDN).

**Upload WebM chapter audio:**

```bash
python3 scripts/upload_local_webm_bibles_to_r2.py
```

**Expected output:**
```
✓ Uploaded 27 chapter files for npiulb
✓ R2 location: https://cdn.everybible.app/audio/npiulb/
```

**Publish to R2:**

```bash
python3 scripts/publish_local_webm_chapter_audio_r2.py
```

This creates a manifest file that the app uses to discover available audio.

### Generating Verse Timestamps

For verse-level audio sync, generate timestamp data:

```bash
python3 scripts/generate_timestamps.py
npm run codegen-timestamps
```

This generates TypeScript files the app uses to sync audio playback to specific verses.

### Audio Architecture

- **Streaming:** eBible.org WebM files stream directly (requires network)
- **Downloads:** Can download chapters for offline playback
- **Offline:** Downloaded audio available without network
- **Backup:** Bible.is streaming remains supported if configured via `EXPO_PUBLIC_BIBLE_IS_API_KEY`

---

## Website Deployments

The EveryBible monorepo includes a public website and admin portal. Both auto-deploy to Vercel on push to `main`.

### Admin Portal (`apps/admin/`)

**Auto-deployment:** Pushes to `main` trigger automatic deployment.

**Environment variables required:**
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY (optional)
MAPLIBRE_API_KEY
```

**Manual deployment (if needed):**

```bash
cd apps/admin
npx vercel --prod
```

**Vercel configuration:** `apps/admin/.vercel/project.json`

### Public Site (`apps/site/`)

**Auto-deployment:** Pushes to `main` trigger automatic deployment.

**Environment variables required:**
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT
R2_BUCKET
```

**Manual deployment (if needed):**

```bash
cd apps/site
npx vercel --prod
```

**Media proxy:** The site includes `/api/media/` endpoint that connects to Cloudflare R2 for Bible text and audio assets.

**Vercel configuration:** `apps/site/.vercel/project.json`

### Monitoring Deployments

1. Go to Vercel dashboard → EveryBible project
2. View deployment history
3. Check build logs if deployment fails
4. Rollback to previous deployment if needed

---

## Supabase Operations

### Local Development

**Start local Supabase:**

```bash
supabase start
```

**Expected output:**
```
Supabase started successfully
Local URLs:
  Postgres:     postgresql://postgres:postgres@localhost:54322/postgres
  API:          http://localhost:54321
  JWT secret:   your-jwt-secret-here
```

**Stop local Supabase:**

```bash
supabase stop
```

**Reset local database:**

```bash
supabase db reset
```

This drops and re-creates the database schema. Migrations are re-applied from `supabase/migrations/`.

**Check local Supabase status:**

```bash
supabase status
```

### Database Migrations

**Push migrations to remote:**

```bash
supabase db push
```

**Expected output:**
```
✓ Pushed migrations to remote
✓ Latest migration: 20260415_add_prayer_reminders.sql
```

**Create a new migration:**

```bash
supabase migration new add_prayer_reminders
```

This creates a new migration file in `supabase/migrations/` with a timestamp prefix.

**Write your SQL in the migration file, then push to remote:**

```bash
supabase db push
```

### Edge Functions

The app uses Supabase Edge Functions for server-side logic.

**Deploy all functions:**

```bash
supabase functions deploy
```

**Deploy specific function:**

```bash
supabase functions deploy track-analytics-events
supabase functions deploy aggregate-engagement
supabase functions deploy send-group-notification
supabase functions deploy submit-chapter-feedback
supabase functions deploy track-anonymous-usage-events
```

**Function locations:**

All functions are in `supabase/functions/` directory. Each function is a TypeScript file that runs on Supabase's edge network.

### Supabase Configuration

**Remote connection:**

The app connects to Supabase via environment variables (set in `.env`):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These are public keys (safe to commit). Secret keys (service role key) should never be committed.

---

## Emergency Procedures

### Kill-Switch a Broken Release

**TestFlight (iOS):**

1. Go to App Store Connect → Your App → TestFlight
2. Select the problematic build
3. Click "Remove from Testing"
4. Testers will no longer see the build

**Command-line alternative:**

```bash
asc builds remove-groups --build BUILD_ID --group 3a75b4d5-cae0-4c9a-8880-890f486f605a
```

**Google Play (Android):**

1. Go to Google Play Console → Your App → Release → Production
2. Find the problematic build in the rollout
3. Click "Halt rollout" or "Cancel rollout"
4. The build will not be distributed further

### Database Corruption on Device

If a user reports database corruption (app crashes when opening Bible):

**The app auto-recovers:**

The `ensureBundledDatabaseReady()` function in `bibleDatabase.ts` detects corruption and automatically retries with `forceOverwrite=true`, which rebuilds the database from scratch.

**User action if auto-recovery fails:**

1. Settings → Apps → EveryBible → Clear Data (or similar, depending on OS)
2. Relaunch the app
3. Database will be re-created on startup

**If widespread corruption:**

1. Ship a new build with bumped version constants (even if no code changed)
2. This forces re-import of the database on all devices

**Update version constants:**

```typescript
// src/services/bible/bibleDataModel.ts
export const BUNDLED_BIBLE_SCHEMA_VERSION = 7; // Increment by 1

// src/services/bible/bibleDatabase.ts
export const DEFAULT_MINIMUM_READY_VERSE_COUNT = 90001; // Verify correct count
```

Then rebuild and release.

### Supabase Outage

If Supabase is unavailable:

**The app gracefully degrades:**
- Bible reading: Works offline (fully functional)
- Audio: Downloaded chapters work offline; streaming fails gracefully
- Reading plans: Bundled plans work offline
- Auth: Sign-in fails (user remains logged out or retains cached session)
- Sync: Deferred until connection restores
- Groups: Local groups visible, synced groups unavailable
- Prayer: Syncs deferred, local list available
- Analytics: Events queued locally

**Expected user impact:**
- Offline reading unaffected
- Auth features unavailable
- Sync will catch up when Supabase returns
- No data loss (events queued locally)

**Monitor Supabase status:**

```bash
supabase status
```

**Escalation:**
1. Check Supabase status page: https://status.supabase.com
2. Check App Store Connect / Play Console crash reports
3. Notify users via in-app notice if outage expected to last >1 hour

### Metro Bundler Hanging

If the app won't build or simulator shows "Metro Bundler Loading...":

**Clear Expo cache:**

```bash
npx expo start -c
```

The `-c` flag clears Metro bundler cache and node_modules cache.

**Expected output:**
```
Metro bundler started on port 8081
Waiting for JS bundle ready...
```

**If still hanging:**

```bash
pkill -f metro
pkill -f expo
rm -rf node_modules .expo
npm install
npm start
```

### iOS Simulator Completely Broken

**Reset all simulators:**

```bash
xcrun simctl erase all
```

**Expected output:**
```
Erased all simulators
```

Then start a fresh build:

```bash
npm run ios
```

### Android Emulator Issues

**Clear Android gradle cache:**

```bash
cd android
./gradlew clean
cd ..
npm run android
```

**Clear emulator data:**

```bash
emulator -list-avds  # List available emulators
emulator @emulator-5554 -wipe-data  # Wipe the one you want
```

### CocoaPods Installation Fails (macOS/iOS only)

**Common error:**

```
error: The sandbox is not in sync with the Podfile.lock
```

**Fix:**

```bash
cd ios
pod install
cd ..
npm run ios
```

**If that doesn't work:**

```bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
npm run ios
```

**Global CocoaPods issue (rare):**

```bash
sudo gem install cocoapods
pod repo update
cd ios && pod install && cd ..
```

---

## Quick Troubleshooting Matrix

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Build number mismatch | Version out of sync | `npm run testflight:sync-version` |
| Build missing in TestFlight | Not attached to beta group | `npm run testflight:submit-and-verify` |
| IPA won't install on simulator | Signing issue | `eas credentials` → revoke/rebuild |
| Metro bundler hanging | Cache stale | `npx expo start -c` |
| iOS pod install fails | Local pod cache corrupt | `pod repo update && pod install` |
| ESLint/format errors | Code style | `npm run lint:fix && npm run format` |
| TypeScript errors | Type mismatch | `npm run typecheck` |
| Database corruption | Version mismatch | Bump `BUNDLED_BIBLE_SCHEMA_VERSION` |
| Simulator black screen | Simulator state bad | `xcrun simctl erase all` |
| TestFlight upload rejected | Marketing version too low | Bump `CFBundleShortVersionString` |

---

## Reference: Configuration Files

### app.json

Key sections for releases:

```json
{
  "expo": {
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.everybible.app",
      "buildNumber": "145",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "com.everybible.app",
      "versionCode": 145
    }
  }
}
```

### eas.json

Key sections:

```json
{
  "cli": {
    "appVersionSource": "remote"
  },
  "build": {
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6758254335",
        "appleTeamId": "NVC9N47PRH"
      }
    }
  }
}
```

### .env (Not Committed)

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-google-id
```

---

## Getting Help

- **ESLint/TypeScript errors:** Run `npm run lint:fix && npm run format`
- **Build failures:** Check `eas build:log --platform ios --profile production`
- **Supabase issues:** `supabase status` and check https://status.supabase.com
- **TestFlight missing build:** Follow "Diagnosing Missing Builds" section above
- **CocoaPods:** See "CocoaPods Installation Fails" in Emergency Procedures
- **General:** Refer to main `CLAUDE.md` project guide

---

**Document created April 2026. Update whenever release procedures, scripts, or credentials change.**
