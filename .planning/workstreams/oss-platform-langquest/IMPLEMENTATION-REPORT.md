# Implementation Report

## Completed

- Phase 0 planning and ADRs.
- Local admin primitives for page headers, cards, filters, and data tables.
- LangQuest admin route at `/langquest`.
- Ownership, selected-ingestion, approval, and publish-state controls in admin.
- Service-role-only Supabase migration for workflow and LangQuest control tables.
- Trigger.dev workflow app scaffold in `apps/workflows`.
- LangQuest candidate discovery task.
- 24-hour scheduled selected-ingestion task.
- Promotion task for approved LangQuest artifacts that writes an EveryBible audio-segment manifest to R2.
- Manual admin enqueue actions for discovery and selected ingestion.
- Pure TypeScript LangQuest ingest package.
- R2 media proxy Range/206 support.
- R2 smoke check using Wrangler against the `everybibleapp` bucket.
- Production Supabase migrations applied and verified through the service-role API.
- Operational scripts added for workflow typecheck/deploy and LangQuest readiness checks.
- GitHub Actions workflow added for non-interactive Trigger.dev workflow deployment once Trigger repo secrets are configured.

## Runtime Contracts

Workflows require these runtime env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRIGGER_SECRET_KEY` for admin-triggered live Trigger.dev enqueue
- `TRIGGER_ACCESS_TOKEN` for non-interactive Trigger.dev deploys
- `TRIGGER_PROJECT_REF` for Trigger.dev deploy config
- `LANGQUEST_SUPABASE_URL`
- `LANGQUEST_SUPABASE_SERVICE_ROLE_KEY`
- `LANGQUEST_STORAGE_BUCKET`
- `LANGQUEST_ALLOWED_PROJECT_IDS` optional comma-separated allowlist
- `LANGQUEST_INGEST_CHAPTER_LIMIT` optional staging throttle
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

No secrets are committed to repo files.

Detailed security, deployment, rotation, R2 verification, staging dry run, and rollback steps are in `RUNBOOK-SECURITY-DEPLOYMENT.md`.

Legacy path inventory, break-glass rules, and Phase 10 decommission procedure are in `RUNBOOK-DECOMMISSION.md`.

## Verification

Passed:

- `npm run admin:typecheck`
- `npm run admin:lint` with one pre-existing Next font warning
- `npm run admin:build`
- `npm run site:typecheck`
- `npm run site:lint`
- `npm run site:build`
- `node --test --import tsx apps/site/app/api/media/route.test.ts`
- `npm test --workspace @everybible/langquest-ingest`
- `npm run typecheck --workspace @everybible/langquest-ingest`
- `npm run typecheck --workspace @everybible/workflows`
- `npm run typecheck`
- `npm run langquest:ops-check` partially passes: EveryBible Supabase, live LangQuest control tables, and R2 pass; Trigger.dev and LangQuest source credentials are missing locally.
- Wrangler R2 bucket list
- Wrangler R2 object download smoke for existing text pack
- Local site `/api/media/...` Range smoke returned `206 Partial Content`
- Local admin `/langquest` smoke returned `200 OK`
- `supabase db push --include-all --yes` applied the missing production migrations.
- Trigger.dev deploy dry run now fails fast in CI mode because `TRIGGER_ACCESS_TOKEN` is not configured.

Known unrelated failures:

- `npm test` currently fails 3 mobile tests outside this workstream:
  - design system reading heading source expectation
  - zh locale key coverage
  - reading plan service plan count

## Residual Risks

- The LangQuest discovery/ingestion tasks are implemented against the schema described in the handoff notes but still need a real LangQuest credentialed dry run.
- Trigger.dev deployment needs `TRIGGER_ACCESS_TOKEN`, `TRIGGER_PROJECT_REF`, and `TRIGGER_SECRET_KEY` configured.
- LangQuest source access needs `LANGQUEST_SUPABASE_URL`, `LANGQUEST_SUPABASE_SERVICE_ROLE_KEY`, `LANGQUEST_STORAGE_BUCKET`, and a pilot `LANGQUEST_ALLOWED_PROJECT_IDS` value.
- R2 credentials were verified locally but should be rotated after being pasted in chat.
- Promotion currently produces a safe segment-manifest artifact and does not mutate `translation_catalog`; app-visible playback needs either segment-manifest consumption in the app or merged chapter derivatives.
- `npm install` reports 25 audit findings; do not run force fixes casually because that can introduce breaking upgrades.
- Existing Next build warns about workspace root inference due multiple lockfiles above the repo.

## Next Operational Steps

1. Generate/configure a Trigger.dev personal access token, project ref, and runtime secret.
2. Configure LangQuest scoped read credentials in workflow environment.
3. Run `npm run langquest:ops-check` until all checks pass.
4. Deploy workflows with `npm run workflows:deploy:staging`, then `npm run workflows:deploy:prod`.
5. Run discovery on one allowlisted project.
6. Review candidates in `/langquest`.
7. Mark one candidate as `ours`, select it, and run selected ingestion with a small chapter limit first.
8. Inspect R2 `langquest/ingest/...` artifacts and admin artifact rows.
9. Promote only after artifact validation and ownership approval.
10. Decide whether the listening app will consume segment manifests directly or whether workflows should generate merged chapter audio before `translation_catalog` exposure.
