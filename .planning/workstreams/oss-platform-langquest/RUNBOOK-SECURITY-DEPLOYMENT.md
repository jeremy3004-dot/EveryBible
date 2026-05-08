# LangQuest Security And Deployment Runbook

Owner: ops/security documentation.
Scope: Phase 9 security hardening and staging/production deployment for the implemented LangQuest control plane.

## Systems

- Admin UI: `apps/admin`, route `/langquest`.
- Workflow app: `apps/workflows`, Trigger.dev tasks under `apps/workflows/src/tasks/langquest.ts`.
- EveryBible control data: Supabase tables `workflow_runs`, `workflow_events`, `langquest_translation_candidates`, `langquest_ownership_decisions`, `langquest_selected_translations`, and `langquest_chapter_artifacts`.
- Source data: LangQuest Supabase and its configured storage bucket.
- Media plane: Cloudflare R2 bucket with immutable objects under `langquest/ingest/...`.

## Required Environment Variables

Admin environment:

- `NEXT_PUBLIC_SUPABASE_URL`: EveryBible Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by admin server actions.
- `TRIGGER_SECRET_KEY`: server-only Trigger.dev key for manual enqueue from `/langquest`.
- `TRIGGER_ACCESS_TOKEN`: Trigger.dev personal access token for non-interactive workflow deploys.

Workflow environment:

- `NEXT_PUBLIC_SUPABASE_URL`: EveryBible Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by workflow tasks.
- `TRIGGER_PROJECT_REF`: Trigger.dev project ref used by `apps/workflows/trigger.config.ts`.
- `LANGQUEST_SUPABASE_URL`: LangQuest Supabase project URL.
- `LANGQUEST_SUPABASE_SERVICE_ROLE_KEY`: LangQuest read credential. Prefer a scoped role/view credential when LangQuest exposes one.
- `LANGQUEST_STORAGE_BUCKET`: LangQuest storage bucket that contains source audio object keys.
- `LANGQUEST_ALLOWED_PROJECT_IDS`: optional comma-separated allowlist. Required for first staging dry run.
- `R2_BUCKET`: Cloudflare R2 bucket name.
- `R2_ENDPOINT`: Cloudflare R2 S3-compatible endpoint.
- `R2_ACCESS_KEY_ID`: R2 write credential.
- `R2_SECRET_ACCESS_KEY`: R2 write credential secret.

Site media proxy environment:

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `LANGQUEST_SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`, `TRIGGER_ACCESS_TOKEN`, `R2_ACCESS_KEY_ID`, or `R2_SECRET_ACCESS_KEY` to client bundles, mobile runtime config, logs, screenshots, PR comments, or committed files.

Trigger.dev documents `TRIGGER_ACCESS_TOKEN` as the non-interactive deploy credential for CI/CD. Treat it like a write-capable deployment secret.

## Least-Privilege Rules

- EveryBible LangQuest and workflow tables have RLS enabled and no `anon` or `authenticated` grants; server-side service-role code owns access.
- Admin access to `/langquest` must remain behind the existing admin authorization gate.
- Operators should be split into these responsibilities before production publish:
  - Viewer: read candidate, selection, artifact, and run status.
  - Ownership reviewer: mark candidates `ours`, `not_ours`, `blocked`, or `archived` with a reason.
  - Ingestion operator: select owned translations and manually enqueue discovery or ingest.
  - Publisher: approve, publish, rollback, or archive catalog-visible artifacts when Phase 7 publishing is enabled.
  - Security admin: rotate credentials and change Trigger/R2/Supabase environment values.
- A candidate can be selected for ingestion only after `ownership_state = 'ours'`.
- Recurring selected ingestion must only process rows with `selection_state = 'selected'`.
- LangQuest credentials should be read-only for project, quest, asset, asset content link, quest asset link, languoid, and storage object read paths. If only service role exists today, track replacement with scoped views/RPCs as a security follow-up.
- R2 credentials used by workflows need object write/read/list only for the target bucket. Prefer a dedicated token for LangQuest ingest instead of reusing a broad Cloudflare account token.
- R2 site proxy credentials should not need write access.

## Secret Rotation

Rotate immediately if a credential was pasted in chat, terminal logs, PR text, issue text, screenshots, or any non-secret store.

General rotation order:

1. Create the replacement secret in the owning provider.
2. Add it to staging environments first.
3. Run the smallest deterministic smoke check.
4. Add it to production environments.
5. Run production smoke checks.
6. Revoke the old secret.
7. Record the rotation date, owner, and affected environments in the operational change log.

Specific smoke checks:

- EveryBible Supabase service role: load `/langquest` in admin and confirm candidates/runs can be read.
- Trigger.dev key: enqueue discovery from `/langquest` and confirm `workflow_runs.provider_run_id` is populated.
- LangQuest Supabase credential: run discovery with `LANGQUEST_ALLOWED_PROJECT_IDS` set to one known project and confirm candidates upsert.
- LangQuest storage access: run selected ingest with a chapter limit of `1` and confirm source audio downloads.
- R2 workflow write credential: run selected ingest with a chapter limit of `1` and confirm manifest plus segment objects exist.
- R2 site proxy credential: request one existing media object through `/api/media/...` and confirm `200` or `206`.

## Trigger.dev Deployment

Preconditions:

- Supabase migration `20260508090000_create_workflow_langquest_tables.sql` has been applied in the target environment.
- `apps/workflows` dependencies are installed.
- Trigger.dev project exists and `TRIGGER_PROJECT_REF` is configured.
- Workflow environment variables are set in Trigger.dev for the target environment.
- `LANGQUEST_ALLOWED_PROJECT_IDS` is set for staging dry runs.

Deploy:

```bash
npm run langquest:ops-check
npm run workflows:deploy:staging
npm run workflows:deploy:prod
```

GitHub Actions deploy path:

- Workflow: `.github/workflows/langquest-workflows-deploy.yml`
- Required repo secrets:
  - `TRIGGER_ACCESS_TOKEN`
  - `TRIGGER_PROJECT_REF`
- Pushes to `main` that touch workflow sources deploy to Trigger.dev `prod`.
- Manual dispatch can deploy either `staging` or `prod`.

Verify deployment:

- Confirm task ids exist in Trigger.dev:
  - `langquest-discover-candidates`
  - `langquest-selected-ingest`
  - `langquest-daily-discovery`
  - `langquest-daily-selected-ingest`
- Confirm schedules:
  - discovery: `30 1 * * *` UTC in `PRODUCTION` and `STAGING`
  - selected ingest: `0 2 * * *` UTC in `PRODUCTION` and `STAGING`
- In admin `/langquest`, run manual discovery and confirm a `workflow_runs` row moves from `queued` to `running` to `succeeded`.

If `TRIGGER_SECRET_KEY` is missing in admin, manual enqueue creates a run record with a `trigger.skipped` warning event. That is useful for visibility, but it is not an executed workflow.

## Cloudflare R2 Verification

Object contract:

- Workflow writes immutable audio segments and manifests under `langquest/ingest/{selected_translation_id}/{source_checksum}/chapters/{BOOK}/{CHAPTER}/...`.
- Segment objects should use `Cache-Control: public, max-age=31536000, immutable`.
- Chapter manifest objects should use `Cache-Control: public, max-age=300, stale-while-revalidate=60`.
- Do not publish app-visible catalog pointers directly to raw ingest paths.

Verification commands:

```bash
wrangler r2 object get "$R2_BUCKET/langquest/ingest/<selected_translation_id>/<checksum>/chapters/<BOOK>/<CHAPTER>/manifest.json" --file /tmp/langquest-manifest.json
node -e "const m=require('/tmp/langquest-manifest.json'); console.log(m.schema_version, m.segments?.length, m.chapter)"
```

Also verify through the site proxy for any path that is app-visible:

```bash
curl -I "https://everybible.app/api/media/<object-key>"
curl -H "Range: bytes=0-1023" -I "https://everybible.app/api/media/<object-key>"
```

Expected proxy behavior for media objects:

- `200 OK` for a normal full-object request.
- `206 Partial Content` for a valid range request.
- `404` for unknown keys.

## LangQuest Staging Dry Run

Use one allowlisted project and the smallest chapter-limited ingest first.

Preconditions:

- `LANGQUEST_ALLOWED_PROJECT_IDS` contains exactly the pilot project id.
- Staging admin and workflow environments point to staging EveryBible Supabase and staging or isolated R2 namespace/bucket.
- No candidate is selected until ownership evidence is reviewed.

Run:

1. Apply the Supabase migration in staging.
2. Deploy `apps/workflows` to Trigger.dev staging.
3. Open `/langquest` in staging admin.
4. Run discovery manually.
5. Confirm candidates appear with the expected language, project name, book count, and chapter count.
6. Mark one candidate `ours` with a reason and evidence note.
7. Select the candidate for ingestion.
8. Trigger selected ingestion with `chapterLimit: 1` from Trigger.dev or a temporary controlled payload.
9. Confirm `langquest_chapter_artifacts` has one `ready` or `not_ready` row.
10. Download the manifest from R2 and inspect segment count, source ids, checksum, chapter metadata, and transcript presence.
11. Confirm no public catalog pointer was changed.

Pass criteria:

- Discovery run succeeds.
- Ownership decision is audited.
- Selected ingest is idempotent when re-run with the same chapter limit.
- At least one ready artifact has a retrievable manifest and all referenced segment objects exist, or `not_ready` states have clear failure reasons.
- No raw LangQuest artifacts are visible in the mobile app catalog.

## Rollback

Trigger.dev:

- Disable schedules for `langquest-daily-discovery` and `langquest-daily-selected-ingest`.
- Remove or invalidate `TRIGGER_SECRET_KEY` in admin if manual enqueue must stop immediately.
- Set selected translations to `selection_state = 'paused'` to stop scheduled ingest without deleting records.

Supabase control data:

- Prefer state changes over deletes.
- Use `paused`, `blocked`, `archived`, or `rolled_back` states to preserve audit history.
- If a run is active and should be ignored, mark it `canceled` or `superseded` and add a `workflow_events` record explaining why.

R2 artifacts:

- Do not mutate or overwrite existing immutable objects.
- Leave bad ingest objects in place unless they contain sensitive data.
- Prevent use by removing or rolling back catalog pointers, not by deleting raw ingest objects.
- If sensitive data landed in R2, make the bucket/path private, delete the affected objects, rotate source credentials, and record incident details.

Catalog/app visibility:

- Roll back by restoring the previous media catalog pointer or manifest version.
- Confirm the app and site proxy read the previous known-good object.
- Do not mark rollback complete until `/api/media/...` returns the expected object and range behavior.

## Production Gate

Do not enable production scheduled ingestion until:

- Staging dry run passed.
- LangQuest credential scope is accepted or the service-role exception is explicitly approved.
- R2 write and read credentials are separated where possible.
- Admin role responsibilities are documented.
- Residual unrelated test failures are recorded and accepted by the release owner.
- Trigger.dev schedules, retries, and failure visibility are verified.
- A rollback owner is assigned for the first production run.
