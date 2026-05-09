# OSS Overseer Rollback and Verification Checklist

## Purpose

Use this checklist before merging, approving production access, or rolling back any part of the OSS implementation program. It is written for a founder/advisor handoff: each workstream can be backed out independently, and engineers still have the commands and ownership boundaries they need.

The safest default is to disable the external tool first, then remove code or config only after the existing mobile app, admin app, and Supabase paths are confirmed healthy.

## Implemented Workstreams and Independent Rollback

### Secret Removal and Environment Configuration

What changed:

- Hardcoded operational secrets were moved toward environment-based configuration.
- Example env files and runtime configuration now describe the required keys instead of storing real secrets.

Rollback path:

1. Do not restore old secrets into Git.
2. If a deployment breaks because a key is missing, add the missing value in the deployment secret store, local `.env`, or CI secret settings.
3. If a config name changed incorrectly, revert only the env-name/config patch and keep real values out of the repo.
4. Re-run the mobile-safe and admin verification commands below.

External tasks:

- Rotate the old Supabase service-role key that was previously exposed or considered at risk.
- Rotate the Gemini key that was previously exposed or considered at risk.
- Update every deployment, local operator environment, and CI secret that used the old keys.
- Confirm old keys no longer work before considering the secret cleanup complete.

### Appsmith Internal-Ops POC

What changed:

- Appsmith is documented and wired as an external, internal-only operations POC.
- The admin app exposes narrow read-only Appsmith endpoints for translation status, media health, and chapter feedback triage.
- Appsmith must not receive the Supabase service-role key directly.

Rollback path:

1. Unpublish or disable the Appsmith app first.
2. Remove Appsmith SSO/VPN/IP allowlist access created for the POC.
3. Rotate any Appsmith-held API key or datasource credential.
4. Remove `APPSMITH_OPS_API_KEY` from admin deployment secrets if the POC is fully abandoned.
5. Revert only the Appsmith admin endpoint files if code removal is required.
6. Keep existing admin pages, Supabase tables, Edge Functions, and mobile app paths unchanged.

External tasks:

- Configure Appsmith outside this repo if the POC continues.
- Store Appsmith credentials in Appsmith/provider secret storage only.
- Confirm Appsmith exports do not contain service-role, R2, Google, Gemini, or upstream provider keys.

### Tolgee Translator Workflow

What changed:

- Tolgee is planned as a translator workflow for app interface strings.
- The Expo runtime still uses bundled `i18next` locale files from `src/i18n/locales`.
- No Tolgee SDK should be required in the mobile app.

Rollback path:

1. Stop Tolgee exports/imports.
2. Revert generated locale file changes from the affected localization PR.
3. Keep `src/i18n/locales/en.ts` as the source of truth for keys.
4. If a bad translation shipped, patch only the affected locale file and release normally.
5. If Tolgee project data is wrong, re-import from the last known-good Git-tracked locale files.

External tasks:

- Configure Tolgee outside this repo if the workflow continues.
- Decide Cloud versus self-hosted, seats, permissions, reviewer roles, and backup/export policy.
- Keep Tolgee project access separate from production app secrets.

### Unleash Feature Flags

What changed:

- Unleash is recommended as a future external flag service, with safe local defaults.
- Supabase analytics remain the source of truth.

Rollback path:

1. Turn off the affected flag in Unleash.
2. If Unleash itself is unreliable, disable the Unleash endpoint/token and let local defaults take over.
3. Remove flag context from analytics only if it is causing reporting confusion.
4. Revert flagged code in a later app/admin release only if the disabled code path still causes issues.

External tasks:

- Configure Unleash outside this repo if adopted.
- Require owner, expiry date, rollout purpose, default value, and rollback note for every production flag.
- Back up Unleash before production use and document who can make emergency flag changes.

### PostHog Optional Product Analytics

What changed:

- PostHog is optional and secondary. It must not replace Supabase analytics or Bible-domain reporting.
- Any mirrored events must be reduced and allowlisted.

Rollback path:

1. Disable PostHog mirroring at the server/app config layer.
2. Rotate or revoke the PostHog project key.
3. Leave Supabase `analytics_events`, admin reports, and engagement summaries untouched.
4. Mark the affected analytics window in the operator notes if bad mirrored data was sent.

External tasks:

- Configure PostHog outside this repo only after privacy review.
- Disable session replay/autocapture anywhere sensitive content could appear.
- Do not send Bible notes, prayer content, search text, free-text feedback, exact location, email, auth tokens, or raw user objects.

### Docling Server-Side Ingestion

What changed:

- Docling is approved only as a server-side ingestion helper for PDFs, Office docs, HTML, scans, or mixed document bundles.
- Docling output is staging material, not publishable content by default.

Rollback path:

1. Stop the Docling worker/job/MCP client.
2. Quarantine or delete the bad staging artifact.
3. Keep original source files and previous promoted manifests.
4. Do not change public catalog availability because of failed Docling output.
5. Re-run ingestion validation before any future promotion.

External tasks:

- Configure Docling outside the mobile/runtime app.
- Decide where source files, converted outputs, checksums, and failure logs are stored.
- Require human or deterministic validation before Docling-derived scripture mappings become publishable.

### Audio and Source-Ingestion Roadmap

What changed:

- `react-native-track-player` is a later native playback option, not a current mobile dependency.
- eBible, CrossWire/SWORD, and STEPBible are source patterns/adapters, not mobile runtime dependencies.
- The manifest-driven media contract remains the boundary between ingestion and the app.

Rollback path:

1. For bad source ingestion, flip catalog/audio-version metadata back to the last known-good version.
2. Leave immutable media objects in place for audit and cache stability.
3. Mark failed candidate versions rejected or quarantined.
4. Do not overwrite published paths.
5. For a future Track Player failure, revert the playback shim replacement while preserving the app-facing `audioPlayer.ts` contract.

External tasks:

- Confirm per-source license, attribution, redistribution rights, derivative rights, source URL, checksum, reviewer, and review date before promotion.
- Treat GPL/AGPL engines, non-commercial sources, no-derivatives sources, and source-available licenses as legal/product review items.

## External Configuration Checklist

These items cannot be completed by code alone:

- Rotate the old Supabase service-role key and update all trusted server environments.
- Rotate the Gemini key and update all trusted server environments.
- Configure Appsmith access, API key storage, SSO/VPN/IP allowlists, and read-only datasource behavior outside the repo.
- Configure Tolgee project, language list, translator/reviewer permissions, exports, and backups outside the repo.
- Configure Unleash environments, production flag governance, backups, and emergency access outside the repo.
- Configure PostHog project settings, reduced event allowlist, retention, and privacy controls outside the repo.
- Configure Docling as a server-side ingestion service, worker, batch job, or MCP-backed tool outside mobile/admin runtime.

## Verification Commands

Run the smallest relevant group for a narrow rollback. Run all groups before a release-bound merge.

### Mobile-Safe

Use for changes that may affect the Expo app, shared TypeScript, i18n, audio, analytics, or runtime config.

```bash
npm run test
npm run typecheck
npm run typecheck:mobile
```

For locale/Tolgee changes, also run:

```bash
node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts
```

### Admin

Use for Appsmith endpoints, admin dashboards, server-side Supabase access, and operations pages.

```bash
npm run admin:typecheck
npm run admin:build
```

For Appsmith endpoint changes, also smoke-check the three read-only endpoints in the deployed or local admin environment:

```bash
curl -i -H "Authorization: Bearer $APPSMITH_OPS_API_KEY" "$ADMIN_BASE_URL/api/ops/appsmith/translations"
curl -i -H "Authorization: Bearer $APPSMITH_OPS_API_KEY" "$ADMIN_BASE_URL/api/ops/appsmith/media-health"
curl -i -H "Authorization: Bearer $APPSMITH_OPS_API_KEY" "$ADMIN_BASE_URL/api/ops/appsmith/feedback?limit=5"
```

Expected result: valid keys return reduced JSON; missing keys return `401` or `503` depending on deployment configuration; no response contains service-role keys or unrelated private fields.

### Scripts and Ingestion

Use for upload scripts, source adapters, audio manifests, Docling staging, and ingestion workflows.

```bash
npm run workflows:typecheck
npm run test -- scripts
```

If the focused script test runner does not match files through `npm run test`, run the specific test file with:

```bash
node --test --import tsx path/to/focused.test.ts
```

For media/source promotion, also verify:

- Source license metadata is complete.
- Manifest checksum matches uploaded bytes.
- Chapter or segment counts match expected coverage.
- Byte-range requests work for audio files.
- The previous known-good version is still available.

### Release-Bound

Use before shipping any mobile, admin, secret, analytics, audio, or ingestion change that could affect users or production operators.

```bash
npm run lint
npm run release:verify
```

For iOS release/TestFlight work, follow the App Store Connect runbook and verify distribution, not upload alone.

## Human Approval Gates

Do not mark the OSS program complete until these are signed off:

- Founder/product owner confirms the rollout and rollback owner for each workstream.
- Engineering confirms no service-role, Gemini, R2, Google, PostHog, Unleash, Tolgee, or Appsmith secret is committed.
- Operations confirms external tools are configured outside the repo with least-privilege access.
- Legal/product confirms source licenses before any new Bible text, audio, study data, or derived dataset becomes public.
- Release owner confirms mobile offline Bible reading, catalog loading, media playback/download, admin health, and chapter feedback still work after rollback tests.
