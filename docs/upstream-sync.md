# Upstream translation sync

`apps/admin/lib/upstream-sync.ts` imports translation metadata and version records into the admin catalog.

## Ownership and merging

- Existing rows retain the operator's `distribution_state`, `is_available`, and `admin_notes`, even if upstream supplies conflicting values. Updates omit these columns, preserving operator edits made while the sync is running.
- New rows accept the initial upstream controls, defaulting to `ready`, available, and no admin notes when omitted. Creation uses INSERT so a concurrent creator cannot have its controls overwritten by an upsert.
- Incoming catalog keys merge over existing keys. The `text`, `audio`, and `timing` sections also merge their immediate keys; omitted sections and delivery metadata remain intact.
- Sparse version refreshes preserve existing publication timestamps, checksums, changelogs, and counts. Only a new version without a publication timestamp receives the sync time. An explicit upstream version timestamp remains authoritative. Versions omitted from the payload are retained.

## Completion and failures

The sync returns success only after recording successful completion in `translation_sync_runs`. If that write fails, the caller receives an error and the sync attempts to record failure. Imports are not transactional: an error may leave already-written catalog/version rows in place, and failure recording can itself fail. This change does not alter current-version selection semantics.

Behavioral regression coverage runs the real module with mocked Supabase and network boundaries:

```bash
node --test --import tsx apps/admin/lib/upstream-sync.test.ts
```
