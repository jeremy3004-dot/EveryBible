# Public EveryBible language atlas

The public homepage opens on the same interactive MapLibre engine as the admin
atlas. It defaults to Field's dark theme and the closer globe camera (65°E,
25°N, zoom 2.75), with overlapping Scripture-colored dots at recorded locations and the Language varieties
collection (languages plus dialects, excluding people groups). The search, record
list, filters, hover summaries, and selected profiles operate on research
records; these counts are not the app's available Bible catalog.

Dots is the default on each fresh page visit and uses spread mode. The public
controls offer only Dots and Clusters; Recorded locations is hidden for now and
remains available in the admin atlas. Spread mode shows one representative point per mapped record and separates
crowded dots only at regional zoom (5 and above); global views remain unshifted, and Clusters groups those positions while zoomed out. The public
collection includes languages and dialects only; people groups remain in the admin atlas. Filtered totals
count source records; unresolved source identities may remain separate.

## Mobile controls

At widths up to 760px, the default view keeps overlapping dots, a slim search
bar, and collapsed Legend and Settings buttons. Focusing search reveals Records;
typing opens the filtered record list. Legend contains Scripture filters, the
and About the data. Settings contains projection,
Dots and Clusters controls, zoom, Fit results, and
Reset view. The public explorer omits the technical record-count/display note.
The spread record-count caption is also hidden on mobile so it does not obscure the map.

Only one mobile panel opens at a time. Close buttons, Escape, and tapping
outside dismiss it without clearing the active filters. Overlapping map dots
in Clusters open a paginated group list; choosing a record
replaces that list with its profile. Dots select their individual record.
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
uses reef, ochre, clay, danger and neutral. Unverified dialects default to red
(**No known Scripture**) without asserting verified absence or altering source data.
Unknown languages also use red. Exact-variety portions, NT and Bible evidence
sets the corresponding dialect color; profiles distinguish unverified coverage.

Map panels use fully opaque surfaces. Hover popups stack above the spread-dot
canvas so dots cannot paint over their text; keep this order when changing map layers.

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

The source reconciliation removes 5,776 proven duplicate variety records while preserving source evidence and exact Scripture scopes. Remaining ambiguous registry identities are still identified as source records, not asserted to be a definitive count of distinct living languages. Historical public snapshot SHA-256: `3402fe0e8eb27591072b371b88ce62d78ebac3169d159e45568df44e1e5b35ac`.

### No known Scripture presentation

All unknown-status records now use red alongside started/needed records under
**No known Scripture**. There is no separate gray Unknown legend filter.
Profiles and hover biographies say **No known Scripture in this language/dialect**;
Agbirigba's identity, classification and country remain visible. This wording is
applied at presentation time so provider statuses and evidence remain unchanged.
Confirmed portions, NT and full-Bible records retain their corresponding colors.
Neutral cluster circles still represent mixed groups, not Scripture status.

### Public profile overview

Selected profiles begin with a concise identity line. A dialect or variety with
a resolved parent is described as a variety of that parent, followed by a
wrapping **Where spoken** area that lists each associated country with a flag
when its two-letter code is valid. Country names remain visible when a flag
cannot be derived.

When a selected record carries source-reported spoken-region labels, the
profile shows those exact labels below the country chips. Identical labels are
collapsed, exact country-name duplicates already shown in the chips are
suppressed, and no labels are inferred from a parent language or another
record.

The overview renders a reported population only when that record has a
non-null, finite source value. It does not inherit a parent's population or
turn a people-group estimate into a speaker count. The public snapshot
currently has no supported population value for Momveda.

When a variety has a known parent-language Scripture status, the profile keeps
that information in a short, explicitly parent-scoped sentence. Exact-variety
status remains separate and unconfirmed when the record does not contain
variety-specific evidence. Approximate map placement remains labeled in the
profile, and identifiers, source records and reference locations remain
available below the overview.

The regenerated public snapshot used by the current overview has SHA-256
`5d6c003cf6d8179329e805fd422e09e249c3479859c5a3eb8594d31982f83151`.
