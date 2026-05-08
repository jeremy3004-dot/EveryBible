# ADR-003: Admin Primitives

## Decision

Start with local admin primitives and Zod server-side validation. Defer wholesale shadcn/ui, TanStack Table, and React Hook Form adoption until the UI actually needs their complexity.

## Rationale

The admin dashboard already has a coherent bespoke visual system and server-component architecture. Pulling in a full shadcn/TanStack/RHF surface immediately would increase churn before LangQuest data exists. Local primitives let the admin harden without a redesign.

## Initial Primitives

- `PageHeader`
- `AdminCard`
- `DataTable`
- `FilterForm`
- Server-side Zod schemas for action/query parsing

## Pilot

Use `/support/users` first because it is read-only, table-heavy, and low mutation risk.
