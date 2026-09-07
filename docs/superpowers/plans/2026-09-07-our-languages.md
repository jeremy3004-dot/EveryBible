# Our Languages Implementation Plan

**Goal:** Add a public Our languages focus that fades other records, subtly pulses active project languages, and displays sourced chapter progress.
**Architecture:** Export a minimal project summary separately from the atlas through exact Every Language entity evidence. Reuse the shared map with optional highlights; filter the public list to those records while preserving map context. No new dependencies or live operational API access.
**Tech Stack:** Existing Next.js, React, MapLibre, Python snapshot tooling.

## Constraints
- Preserve existing uncommitted atlas work.
- Only export project name, exact atlas record ID, chapter totals, media format flags, and source/date.
- Do not infer publication, translation/checking stages, or related dialect membership.
- Respect reduced motion. No continuous redraw of the full atlas for a pulse.
- This task does not deploy.

## Tasks
- [x] Preserve the supplied September 7 CSV; select exactly the 23 projects with activity within 30 days.
- [x] Export source recording metrics separately from reviewed atlas identity links; never derive recording percentage from partial chapter totals.
- [x] Keep all 23 projects in a searchable, project-first list. Show unconfirmed map links honestly while preserving their progress cards.
- [x] Verify source metrics, map interaction, accessible motion, responsive layouts, tests, lint, typechecks and production builds.
- [ ] Commit only relevant atlas code, data, documentation and tests to main. Hand exact SHA to the dedicated Vercel release task for publishing and live verification.

## Release verification

Isolated release excludes unrelated hover/profile WIP and research data. Passed: 77 TypeScript tests, 29 Python tests, site/admin lint (one existing admin font warning), typechecks, production builds, both snapshot checks, and real Chrome verification at desktop, 390px and 320px. Browser checks covered all 23 projects, source percentages, map selection, project-name search, an unlinked project card, Dots/Clusters, and reduced motion. Seventeen projects have reviewed atlas links; six remain explicitly unlinked pending source identity confirmation.
