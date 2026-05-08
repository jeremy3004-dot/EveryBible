# ADR-004: LangQuest Access

## Decision

Prefer scoped LangQuest views/RPCs over broad service-role access. If service-role access is unavoidable, keep it server-side only and document credential scope/rotation.

## Required Source Rules

- Only `project.template = 'bible'`.
- Only eligible public/published projects agreed by allowlist or scoped view.
- Use target language from `project_language_link.language_type = 'target'`.
- Order segments by asset order/created time and content-link order/created time.
- Exclude derived translation assets with `asset.source_asset_id is null`.
- Skip audio keys starting with `local/` or `file://`.

## Consequences

- LangQuest discovery and ingestion run only server-side.
- Admin stores candidate/ownership/selection state locally in EveryBible Supabase.
- Source refresh cannot overwrite manual ownership decisions.
