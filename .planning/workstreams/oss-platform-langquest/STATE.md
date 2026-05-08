# State

## Current Status

Implementation workstream executed through the first production-capable slice:

- Planning/ADRs complete.
- Admin foundation primitives complete.
- Observability run ledger migration complete.
- Trigger.dev workflow app scaffold complete.
- LangQuest candidate discovery and selected-ingestion workflow tasks implemented.
- Admin ownership checklist, approval gates, publish-state controls, filters, and manual workflow enqueue actions complete.
- R2 ingest primitives and media proxy Range support complete.
- Promotion manifest task complete for approved LangQuest artifacts.

## Current Phase

Implementation complete through the admin-controlled ingestion and promotion-manifest slice. Remaining work is staging rollout with real LangQuest credentials and app playback/product publishing decisions.

## Next Action

Apply the migration and run the first credentialed staging dry run against one allowlisted project with `LANGQUEST_INGEST_CHAPTER_LIMIT` set.

## Guardrails

- Do not commit runtime secrets.
- Do not publish LangQuest artifacts to app-visible catalog paths before ownership and QA approval.
- Do not run full selected ingestion against all projects until one allowlisted project passes a small chapter-limited dry run.
- Do not mark a selected LangQuest translation as app-publishable until either segment-manifest playback or merged chapter generation is implemented.
- Do not run force audit fixes without a separate dependency-upgrade plan.

## Open Questions

- Will Trigger.dev be self-hosted, managed, or rejected in favor of Graphile Worker?
- Will the listening app consume ordered segment manifests, or should workflows generate merged chapter audio for the existing stream-template model?
- Does LangQuest expose a scoped read view/RPC for eligible Bible projects, or do we need to propose one?
- Should operators need spreadsheet-style review outside admin, or is admin checklist enough?
- Which roles can mark translations as ours and approve/publish them?
