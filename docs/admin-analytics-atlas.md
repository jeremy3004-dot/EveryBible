# Admin activity atlas

Implemented September 5, 2026 in `apps/admin`.

## Direction

Keep the existing Field brand, Next.js application, MapLibre renderer, and
Supabase reporting contract. Put global totals first, then an interactive atlas
with its own explicit translation scope, country inspector, daily chart, and
searchable data tables. This upgrade adds no paid services, database migrations,
location collection, user identity exposure, or external writes.

## Operator workflow

1. Choose a reporting window on Analytics.
2. Choose listening, reading, or downloads and optionally a translation.
3. Switch flat map/globe or heat/points. Fit activity and reset view are explicit.
4. Select a country from the ranking, map, or table. Inspect its region, subregion,
   country totals, share of country-attributed activity, and individual buckets.
5. Search and sort either table; export only the visible results as CSV.
6. Inspect daily values with the date slider or accessible table and export them.

The overview now starts with a 30-day reach summary. Operational counts link to
their source pages. The analytics desktop navigation rail remains visible, and
small screens receive a compact admin navigation menu.

## Correctness fixes

- Use a country + coordinates + precision identity for map clicks; the former
  country-code-only lookup could open the wrong location within a country.
- Reject invalid coordinates and keep country-center fallbacks separate from
  approximate IP buckets.
- Use genuine country rollups for the inspector. Never mislabel one bucket's
  value as a country's total or sum listener counts across geography.
- Preserve totals for translations without geography and show explicit empty
  map/table states rather than substituting unrelated overall geography.
- Keep the map instance stable across theme changes. Repaint its existing vector
  layers instead of replacing styles; resize the map with its container.
- Synchronize the theme toggle from the document after a consistent SSR snapshot,
  eliminating the saved-dark-theme hydration mismatch.
- Render SVG titles as a single text value to avoid chart hydration mismatches.

## Verification

- Regression tests cover country-vs-location scope, unique feature identities,
  zero/invalid coordinates, log weights, fallback precision, UTC missing days,
  and spreadsheet formula escaping.
- Admin tests, lint, typecheck, and production build are required before release.
- Chrome visual and interaction QA uses an isolated temporary development-only
  page with synthetic aggregate data, removed before the production build.
- Verified country/location drilldowns, reading scope, translation empty states,
  map/globe and heat/points switches, sorting, search, a real filtered CSV file,
  chart date scrubbing, and light/dark themes.
- Responsive check at 390 × 844: page width 390px, map width 356px; no page overflow.
- Desktop checked at the existing 1517 × 834 Chrome viewport. Readability review
  covered palette, typography, controls, map labels/contrast, panel spacing,
  table alignment, and responsive stacking. The prior duplicated translation
  chips are intentionally removed and the heading is now “Global reach”.
- Image generation for an additional concept failed with a network error. Visual
  review used `apps/admin/DESIGN.md` and the existing live UI as the references.

Production publication remains a separate deployment handoff under AGENTS.md.

### Final results

- 53 admin tests passed; zero failures.
- `npm run admin:lint`: zero errors; the pre-existing Next.js custom-font warning remains.
- `npm run admin:typecheck`: passed.
- `npm run admin:build`: passed. The temporary QA route is absent from the output.
- Live read-only 30-day RPC check at 2026-09-05 05:29 UTC: 8 countries,
  19 mapped locations, 13 translations; all countries have region metadata and
  no invalid coordinates reach the map model.
- Fresh dark-theme hydration plus rapid light/dark switching: no new browser
  console errors or warnings. Filtered country CSV content matched the displayed
  row, and date scrubbing changed the displayed date/value.
- No publication, commits, database mutations, or changes to mobile work were
  performed by this task. Existing concurrent mobile changes were preserved.


## Follow-up: collection and metric repairs

The subsequent collection audit extends this atlas with reading coordinate
buckets, country-only remainder points, complete translation totals, UTC windows
including today, and a collection-health panel. The original country-center-only
reading behavior described above is superseded. See
[analytics-collection-audit.md](analytics-collection-audit.md) for verified defects,
privacy limits and the database/collector/admin/mobile release order.
