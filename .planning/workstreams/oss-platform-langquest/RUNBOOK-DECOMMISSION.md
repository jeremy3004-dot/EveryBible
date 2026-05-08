# LangQuest Decommission And Legacy Path Runbook

Owner: ops/security documentation.
Scope: Phase 10 decommission guidance for replacing old or manual LangQuest/media paths after the implemented control plane is proven.

## Canonical Path

The canonical LangQuest path is:

1. Discover eligible Bible projects from LangQuest with `langquest-discover-candidates`.
2. Review ownership in admin `/langquest`.
3. Select only candidates marked `ours`.
4. Ingest selected translations with `langquest-selected-ingest`.
5. Write immutable chapter artifacts to R2 under `langquest/ingest/...`.
6. Keep raw ingest artifacts out of app-visible catalogs until publishing approval exists.
7. Publish or roll back by pointer/manifest state, not by mutating R2 objects.

Any path that bypasses ownership review, workflow run records, artifact rows, or immutable R2 object keys is legacy/manual and must be documented as break-glass only or removed.

## Legacy Inventory Checklist

Before removing or downgrading a path, inventory:

- Scripts that upload, mirror, or rewrite Bible audio/text objects outside the workflow ledger.
- Admin pages or server actions that change translation/audio availability without audit records.
- Manual SQL snippets used to mark translations as available.
- Cloudflare R2 scripts that write app-visible paths directly.
- Local one-off LangQuest export, download, conversion, or manifest scripts.
- Any cron, GitHub Action, Supabase scheduled function, or Vercel cron that overlaps with Trigger.dev tasks.
- Any documentation that tells operators to update media catalog state without the LangQuest admin workflow.

Keep commodity Bible media scripts that still serve non-LangQuest sources, but label their relationship to the LangQuest path clearly.

## Decommission Preconditions

Do not remove a legacy path until:

- At least one staging dry run has passed.
- Production discovery has run successfully.
- Production selected ingest has created verified R2 artifacts for a pilot translation.
- Operators can see workflow status, failures, and artifact state from admin.
- Rollback has been tested by pointer/state change.
- There is no pending incident or active ingestion job using the old path.
- The replacement path has enough documentation for an on-call operator to run without code changes.

## Decommission Procedure

1. Freeze the legacy path.
   - Disable schedules or automation first.
   - Leave manual commands unavailable to routine operators.
   - Announce the freeze in the release/change log.

2. Snapshot current state.
   - Export affected Supabase rows or capture row counts and ids.
   - List affected R2 prefixes and object counts.
   - Record current catalog pointers.
   - Record workflow run ids proving the replacement path works.

3. Migrate ownership and selection state.
   - Ensure each kept LangQuest translation has a candidate row.
   - Ensure ownership decisions include evidence and reason text.
   - Ensure selected translations point to the correct EveryBible `translation_id` when one exists.

4. Mark legacy outputs read-only.
   - Keep historical R2 objects immutable.
   - Stop writing new objects to old prefixes.
   - Add comments or docs that old prefixes are retained for rollback/history only.

5. Remove or downgrade code/docs in a dedicated PR.
   - Remove automation only after schedules are disabled.
   - Keep break-glass scripts only when they have an explicit owner, input contract, rollback note, and warning banner.
   - Add or update tests for the canonical path when production code changes are part of the decommission PR.

6. Verify.
   - Trigger discovery and selected ingest in staging.
   - Confirm no legacy run records or object writes occur.
   - Confirm admin status and R2 verification still pass.
   - Confirm public catalog pointers still resolve.

7. Close the loop.
   - Update `IMPLEMENTATION-REPORT.md`.
   - Record removed paths, retained break-glass paths, and rollback location.
   - Add date, operator, and reviewer.

## Break-Glass Rules

Break-glass scripts are allowed only when the workflow plane is unavailable and a release-critical media operation cannot wait.

Break-glass use must:

- Be approved by the release owner.
- Use staging first unless the outage is production-only and time-sensitive.
- Write immutable R2 keys or restore an existing pointer.
- Create or update a `workflow_runs` row with `provider = 'manual'` when practical.
- Add a `workflow_events` entry describing what happened.
- Avoid broad source exports.
- Avoid deleting historical objects.
- End with a follow-up issue or doc note explaining why the canonical path was not enough.

## Rollback After Decommission

If the replacement path fails after legacy removal:

- Pause selected translations by setting `selection_state = 'paused'`.
- Disable Trigger.dev schedules.
- Restore the last known-good catalog pointer.
- Use retained read-only legacy artifacts only if the release owner approves.
- Re-enable a removed legacy path only through a revert or emergency patch that is reviewed after the incident.

## Residual Test Failures To Track

The implementation report records unrelated failures in `npm test`:

- design system reading heading source expectation
- zh locale key coverage
- reading plan service plan count

These are not blockers for documenting Phase 9/10, but they are release risks if a broader production gate requires full mobile test success. Keep them visible in handoff notes until fixed or formally accepted by the release owner.

## Final Decommission Criteria

The old path is decommissioned when:

- No scheduled automation calls it.
- No routine operator runbook references it as a normal path.
- The canonical Trigger.dev/admin/R2 path has run successfully in production.
- Rollback uses catalog pointers or state transitions, not object mutation.
- Retained scripts are explicitly labeled break-glass and have owners.
