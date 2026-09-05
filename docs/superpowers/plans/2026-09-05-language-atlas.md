# Language atlas implementation plan

**Goal:** Add a researched, sourced language/dialect list and globe to the admin.

**Architecture:** An immutable, reproducible source snapshot feeds independently
authenticated Next.js route handlers. A compact client index drives the list,
filters and MapLibre points; detail evidence loads on selection. Preserve the
existing analytics map and share its basemap treatment.

**Stack:** Existing Next.js 15.5.14, React 19.1, TypeScript, MapLibre 5.21.1,
Node test runner; Python standard library for source import if appropriate.

## Constraints

- Follow `2026-09-05-language-atlas-design.md` and `apps/admin/DESIGN.md`.
- All source rows retain their identifiers and provenance; no fuzzy auto-merges.
- No parent-language Scripture claim becomes a verified dialect claim.
- No imaginary locations, hidden unmapped rows, or population double counting.
- No public snapshot route, credentials in source, deployment or database change.
- No new production dependency. Preserve other work and existing analytics.

## Research and planning

- [x] Inspect admin navigation, map, auth, design docs, test runner and source paths.
- [x] Check official MapLibre clustering/projection documentation through Context7.
- [x] Compare reuse approaches and document the snapshot design.
- [x] Finish three Luna source reports: Every Language, Joshua Project, GRN/local registry.
- [x] Review source counts, licensing, joins and data availability before page coding.

## Data implementation

- [x] Define the shared `apps/admin/lib/language-atlas/types.ts` contract.
- [x] Write importer regression cases for ROLV IDs, Glottolog hierarchy, Scripture
  scope, source coordinates, unknown statuses and unmatched records; confirm red.
- [x] Implement `scripts/language-atlas/` import/validation and produce compressed
  index/details plus provenance manifests in `apps/admin/data/language-atlas/`.
- [x] Keep raw inputs in `data/language-atlas/sources/`, attributed and dated.
- [x] Reconcile output record counts with every input; validate deterministic rebuild.

## Admin page implementation (Astra)

- [x] Implement `apps/admin/components/language-atlas/` with bounded result rows,
  search/filter model, map/globe, hover bios, inspector and CSV export.
- [x] Add `/languages` page/loading/error, the sidebar entry, and scoped CSS.
- [x] Extract reusable basemap theme behavior into `apps/admin/lib/atlas-basemap.ts`
  and retain existing analytics tests/behavior.
- [x] Write meaningful model tests before logic; use existing branding tokens,
  no copied external HTML, and no per-record DOM map markers.

## Server integration (primary)

- [x] Add snapshot loader and authenticated `/api/language-atlas` index/detail
  routes with tests proving unauthenticated access cannot read data.
- [x] Add explicit Next standalone tracing for the immutable snapshot files.
- [x] Confirm typed contract across UI, loader and importer; resolve mismatches.

## Review and verification

- [x] Independently review data joins and source scope, then implementation quality.
- [x] Run importer checks, all admin tests, admin lint/typecheck and production build.
- [x] Exercise the full dataset in the browser, including hover dots, overlapping
  records, touch/keyboard selection, empty results, theme and mobile layouts.
- [x] Inspect generated artifacts/trace, remove temporary QA routes, retain evidence.
- [x] Document exact counts, refresh instructions, known source limits and test results.

## Completion evidence

- Final snapshot: 62,832 records, 61,312 placed (34,843 approximate), 1,520 unmapped.
- Independent Luna source audit confirmed every original registry identity, all
  8,590 Every Language language coordinate rows, 1,395 GRN geometry points, and
  all 44 unmatched historical GRN dialect records retained separately.
- `npm run atlas:check`: 9 importer regressions and byte-for-byte rebuild passed.
- `npm run verify:workspace`: lint/typecheck and all 1,693 tests passed. Existing
  Next font warning remains; no new lint errors.
- `npm run admin:build`: production build passed; `/languages` is 10.3 kB route
  code, 381 kB first-load JS with the shared mapping dependency.
- All 17 runtime snapshot files in standalone output match their SHA-256 hashes.
  Raw source downloads and the temporary preview route are absent from the bundle.
- Browser: full-data map/globe, both themes, hover-to-point identity, cluster
  chooser, country/search/placement filters, source profiles, filtered 31-row CSV,
  empty state, retry recovery, keyboard selection, and 390px responsive layout.
- Packaged API denies unauthenticated requests; login with a real admin account
  was not exercised because this checkout has no live admin environment.
- Changes are local and uncommitted. No deployment, merge, or database mutation.
