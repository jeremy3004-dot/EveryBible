# Public EveryBible language atlas

The public homepage opens on the same interactive MapLibre engine as the admin
atlas. It defaults to Field's dark theme and the closer globe camera (65°E,
25°N, zoom 2.75), with overlapping Scripture-colored dots at recorded locations and the Language varieties
collection (languages plus dialects, excluding people groups). The search, record
list, filters, hover summaries, and selected profiles operate on research
records; these counts are not the app's available Bible catalog.

Recorded locations is the default and allows overlap at source positions. Optional
Spread mode shows one representative point per mapped record and separates
crowded dots only at regional zoom (5 and above); global views remain unshifted, and Clusters groups those positions while zoomed out. The public
collection includes languages and dialects only; people groups remain in the admin atlas. Filtered totals
count source records; unresolved source identities may remain separate.

## Mobile controls

At widths up to 760px, the default view keeps overlapping dots, a slim search
bar, and collapsed Legend and Settings buttons. Focusing search reveals Records;
typing opens the filtered record list. Legend contains Scripture filters, the
unknown-status explanation, and About the data. Settings contains projection,
Spread dots, Recorded locations and Clusters controls, the source-aware record
count, zoom, Fit results, and Reset view.

Only one mobile panel opens at a time. Close buttons, Escape, and tapping
outside dismiss it without clearing the active filters. Overlapping map dots
in Recorded locations or Clusters open a paginated group list; choosing a record
replaces that list with its profile. Spread dots select their individual record.
Hover summaries are disabled on mobile to avoid duplicate popups.
The floating QR/app card, direct store links, provider credit, and research
availability note stay visible while panels are open. Desktop controls retain
their expanded layout.

The shared map accepts an optional controls target for the public mobile
Settings panel, a group-selection callback for the single-panel flow, and a
hover-summary switch. Without these options, the admin map retains its existing
controls, groups, and hover summaries.

Local browser regression: run `npm run dev --workspace @everybible/site --
--hostname 127.0.0.1 --port 3100`, then pass
`scripts/browser-tests/public-atlas-mobile.js` to the managed Playwright
`browser_run_code_unsafe` tool's `filename` argument. The regression checks collapsed
defaults, panel replacement/dismissal, Settings actions, QR preservation,
320px overflow/overlap, and desktop controls.

Field branding is defined in `packages/brand/tokens.css` and mirrored by the
existing app stylesheets: Bricolage Grotesque headings, Archivo UI, JetBrains
Mono labels, warm charcoal/cream surfaces, and blue accents. Scripture status
uses reef, ochre, clay, danger and neutral, preserving unknown separately.

## Public data boundary

`scripts/language-atlas/build_public_atlas.py` reads the reviewed admin index
and explicitly selects public identity, search, summary, Scripture-scope,
location, country and source fields. The public artifact is
`apps/site/data/language-atlas/index.json.gz`. New fields added upstream do not
automatically become public. All 57,056 records and 80,749 source placements
are retained. Original source evidence shards, raw imports, active-project
data, identities and operational APIs are not included in the site endpoint.

`GET /api/language-atlas` streams this gzip snapshot with public caching. The
admin endpoints independently continue to require an authorized identity and
return private/no-store responses. Next tracing must include the site's exact
snapshot, never the admin detail shards. Root `/data` remains excluded from
Vercel uploads; nested app runtime data must remain included.

Regenerate after any admin snapshot update:

```sh
python3 scripts/language-atlas/build_public_atlas.py
python3 scripts/language-atlas/build_public_atlas.py --check
python3 -m unittest discover -s scripts/language-atlas -p 'test_*.py'
```

Joshua Project's current terms were reviewed at
https://joshuaproject.net/help/terms on 2026-09-05. The owner explicitly confirmed
existing permission covers public republication in this release. Preserve the
linked “Data provided by Joshua Project” acknowledgment, Glottolog's CC BY 4.0
attribution, and each provider's source links and terms. The public view adds
cross-registry language/dialect identity, exact-scope Scripture distinctions,
and explicitly labeled location precision; it does not copy source photos,
audio or long biographies.

## App downloads

Canonical destinations remain in `apps/site/lib/site-links.ts`. The existing
QR was decoded and verified to contain `https://everybible.app/download`.
That smart route chooses the Apple or Google store by device and sends desktop
visitors to `/#download`; the homepage must retain this anchor. Provide direct
store buttons as well as the QR, with a white quiet zone for reliable scanning.

## Release verification

Run workspace lint, typechecks and tests, public-snapshot regeneration checks,
and both production builds. Inspect the site API trace for the exact public
snapshot and absence of private shards. Check desktop/mobile first load,
search/filter/profile interactions, map/globe and spread/recorded/cluster switches, source
attribution, download routing, and unauthenticated admin API rejection.
The deployment task owns main integration and both Vercel deployments.

### Local verification completed 2026-09-05

- Workspace lint and typechecks passed; 1,704 tests passed. Both production
  builds passed. Python source/projection tests and deterministic snapshot checks passed.
- Public route trace includes exactly one atlas file, the site snapshot; no
  private admin shards. SHA-256:
  `7c6f47cf354b3ae4e75bfe04fc831dbec0a74754c320fd45c0039a00eee1b658`.
- Browser review: desktop 1440×960, phones 390×844 and 320×740; admin light/dark
  palette; globe/flat-map and individual/cluster switches; exact Phu search and
  profile (unknown exact variety, separate started parent context); source
  attribution; Escape and profile scroll reset; dark About page.
- QA fixed inherited broken navigation anchors, small-screen CTA wrapping,
  attribution overlap, and stale ready state during MapLibre instance replacement.
  The lifecycle regression verifies replacement maps are not treated as loaded.
- Temporary local-only admin preview route and fixture servers were removed
  before builds. Final live verification belongs to the deployment task.

### Spread-view update 2026-09-06

The shared canvas overlay projects one representative location per record. Overlapping anchors move to the nearest free position on a deterministic hexagonal screen lattice; actual coordinates remain unchanged. Dot spacing grows with zoom, and the overlay uses MapLibre's globe occlusion check. Hover and selection show a line to the recorded reference point. The in-view count includes projected records in the map viewport, including areas covered by panels. Dense overview dots are small; zooming in exposes each point more clearly.

The source reconciliation removes 5,776 proven duplicate variety records while preserving source evidence and exact Scripture scopes. Remaining ambiguous registry identities are still identified as source records, not asserted to be a definitive count of distinct living languages. Current public snapshot SHA-256: `3402fe0e8eb27591072b371b88ce62d78ebac3169d159e45568df44e1e5b35ac`.
