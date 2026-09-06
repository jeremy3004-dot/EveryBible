# Spread variety dots implementation plan

> User approved the recommended design in this conversation: automatically separate variety dots, preserve recorded locations, count each variety once, separate people groups, and reconcile verified duplicate identities. Execute in this worktree with bounded parallel workers and primary-agent review.

**Goal:** Make overlapping language varieties individually visible and selectable in the public and admin atlas.

**Architecture:** Keep immutable source geography and evidence. Add a spread display mode that uses one representative point per record and a deterministic screen-space layout. Use the existing MapLibre globe/map renderer. The recorded-locations and clustered views retain source geography. Reconcile identities only through explicit, unambiguous source IDs.

**Tech stack:** Next.js 15, React 19, MapLibre 5.21, TypeScript/node:test, Python importer tests.

## Constraints

- Default collection is language varieties (languages plus dialects); people groups remain separately selectable.
- Default display is spread; recorded locations and clusters remain available.
- No invented source coordinates or changes to Scripture claims.
- One representative dot per record in spread mode. Never silently omit crowded records.
- Separation is a presentation offset, labeled in the UI. Hover explains approximation and connects displaced points to their reference location.
- Preserve unverified identities as reviewable records; do not merge by name or shared parent ISO.
- Respect existing work, retain public/admin authentication boundaries, and validate both apps.

## Task 1: Source identity reconciliation (data worker)

Files: `scripts/language-atlas/everylanguage.py`, related importer helpers/tests, generated atlas snapshots/reports.

- [x] Trace Basoko duplicate identifiers from the retained snapshots.
- [x] Add failing regressions for unambiguous external-ID matching and ambiguous links staying separate.
- [x] Resolve proven one-to-one GRN/ROLV links, retaining original source evidence and relationships.
- [x] Rebuild admin and public snapshots; report precise count changes and verification.

## Task 2: Collection and controls (UI worker)

Files: shared `types.ts`, `model.ts` filtering/defaults and tests; admin `LanguageAtlas.tsx`, `AtlasPanels.tsx`; public `PublicLanguageAtlas.tsx`, details copy; relevant CSS and docs.

- [x] Add `AtlasDisplayMode = 'spread' | 'individual' | 'clustered'` and filter kind `varieties`.
- [x] Test that varieties includes language/dialect records and excludes people groups.
- [x] Default both apps to varieties/spread, with accessible Spread dots / Recorded locations / Clusters controls.
- [x] Show filtered record count and clear display/geography explanation; keep counts honest about unresolved source identities.
- [x] Update documentation and verify responsive control layout.

## Task 3: Shared map layout (primary)

Files: new pure spread layout and tests, shared map integration, rendering lifecycle helpers/tests.

- [x] Test representative-point selection, deterministic separation, no lost IDs, unchanged input geography, globe backside rejection, and dense layout behavior.
- [x] Lay out visible projected anchors with compact deterministic offsets and collision-aware spacing.
- [x] Render using a screen overlay tied to MapLibre projection so globe visibility and coordinates remain correct. Recompute after camera changes, update during movement, respect reduced motion.
- [x] Keep hover/click, selected record, accessible list, camera navigation, and source-location mode working. Provide reference-location leader on hover.
- [x] Verify actual full-dataset performance and Ngelima/ROLV selection in browser.

## Task 4: Review and delivery (primary)

- [x] Review worker diffs and source evidence preservation.
- [ ] Run importer deterministic checks, workspace lint/typecheck/tests, and production builds for site/admin.
- [ ] Browser-check desktop and mobile, globe/map, spread/recorded/clusters, search, hover and selected profiles. Capture evidence.
- [ ] Present the result. Follow the existing project release handoff for any publication and local-main integration; no parallel publishing.

## Verification notes

- Source reconciliation retained all 35,348 Every Language entity IDs, all 70,232 external-ID evidence rows, and all 8,590 source coordinate references. No surviving Scripture status, scope, or parent context values changed.
- The final snapshot has 57,056 records, including 30,790 dialect/variety records. Basoko ROLV 01423 now retains both matching Every Language source entities in one record.
- A real 28,970-point projected scene exposed repeated spiral searches taking 5.7 seconds. A nearest-free hex lattice with row successor links reduced layout to 31.6 ms; a 30,000-point varying-anchor regression now completes in about 64 ms.
- Workspace lint/typechecks and 1,710 tests passed before the final performance adjustment; final combined verification follows mobile-layout integration.
