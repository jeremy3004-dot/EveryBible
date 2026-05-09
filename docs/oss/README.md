# OSS Adoption Phase

## Purpose

This phase turns the OSS Scout findings into reversible, low-risk adoption work. The goal is to supplement commodity operations tooling without replacing EveryBible's mobile Bible core.

## Scope

In scope:

- Remove tracked hardcoded secrets and move operational keys to environment variables.
- Document an Appsmith internal-ops proof of concept for translation status, media health, and chapter feedback triage.
- Document Tolgee as a translator workflow while keeping `i18next` as the bundled runtime.
- Document Unleash and optional PostHog adoption gates without replacing existing Supabase analytics.
- Document later audio and ingestion upgrades such as `react-native-track-player` and Docling.

Out of scope for this first pass:

- Adding new runtime dependencies.
- Replacing Supabase, SQLite FTS, R2 media delivery, or the custom mobile reader.
- Embedding service-role keys in any third-party UI builder.
- Shipping Appsmith, Tolgee, Unleash, PostHog, Docling, or Track Player to production before a separate approval gate.

## Rollback Model

This phase is intentionally docs-first and config-only.

Rollback options:

1. Revert this branch before merge.
2. Revert only the `docs/oss/**` files if the adoption plan is not wanted.
3. Keep the secret-removal patch even if all OSS adoption docs are discarded.

No mobile runtime behavior should change in this pass.

## Safety Gates

Before any OSS tool moves past proof of concept:

- License reviewed and recorded.
- Secrets stored only in `.env`, deployment secrets, or provider secret stores.
- Service-role access isolated behind server-side endpoints or read-only database contracts.
- Mobile offline Bible reading and SQLite FTS remain untouched.
- A rollback procedure exists for the specific tool.

## Workstream Runbooks

- [Appsmith internal-ops POC](./appsmith-poc.md)
- [Tolgee translator workflow](./tolgee-workflow.md)
- [Feature flags and analytics](./flags-analytics-plan.md)
- [Audio and ingestion roadmap](./audio-ingestion-roadmap.md)
- [Overseer rollback and verification checklist](./rollback-checklist.md)

## Recommended First Slice

The first implementation slice should be Appsmith for internal operations only:

1. Translation catalog status.
2. Media manifest health.
3. Chapter feedback triage.

This should connect through server-side admin APIs or read-only Supabase views/RPCs, not direct client-side service-role credentials.
