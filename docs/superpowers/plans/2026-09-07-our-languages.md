# Our Languages Implementation Plan

**Goal:** Add a public Our languages focus for all 23 Every Language projects active within 30 days. Fade other records, subtly pulse reviewed project languages, and display the source recording progress for every project.
**Architecture:** Export a minimal project summary separately from the atlas through exact Every Language entity evidence. Reuse the shared map with optional highlights; keep all 23 projects in a project-first list while preserving map context. No new dependencies or live operational API access.
**Tech Stack:** Existing Next.js, React, MapLibre, Python snapshot tooling.

## Constraints
- Preserve existing uncommitted atlas work.
- Export the project name, exact reviewed atlas record ID when available, source recording metrics, and source/date.
- Keep projects without an exact reviewed atlas link visible in the project list and progress panel without guessing their map position.
- Do not infer publication, translation/checking stages, or related dialect membership.
- Respect reduced motion. No continuous redraw of the full atlas for a pulse.
- Publishing is owned by the dedicated Vercel release task after the exact commit SHA is handed off.

## Tasks
- [x] Preserve the supplied September 7 CSV; select exactly the 23 projects with activity within 30 days.
- [x] Export source recording metrics separately from reviewed atlas identity links; never derive recording percentage from partial chapter totals.
- [x] Keep all 23 projects in a searchable, project-first list. Show unconfirmed map links honestly while preserving their progress cards.
- [x] Verify source metrics, map interaction, accessible motion, responsive layouts, tests, lint, typechecks and production builds.
- [x] Commit only relevant atlas code, data, documentation and tests to main. Hand exact SHA to the dedicated Vercel release task for publishing and live verification.
