# ADR-002: Observability

## Decision

Add observability before real LangQuest ingestion runs:

- Workflow run records in Supabase for operator visibility.
- Optional GlitchTip/Sentry-compatible error capture.
- Optional PostHog admin events and feature flags.

## Rationale

LangQuest ingestion can fail because of external access, missing audio, local-only keys, R2 upload errors, manifest validation, or publishing checks. Operators need structured status and retry visibility from the first real run.

## Rules

- Do not include transcripts, credentials, private notes, or raw external payloads in analytics events.
- Use stable job/run ids across logs, workflow events, admin UI, and error reports.
- Feature-flag risky workflow transitions.
