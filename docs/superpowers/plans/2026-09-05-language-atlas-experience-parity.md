# Language atlas experience parity implementation plan

> Implementation: Sol High workers. Planning, reference inspection, integration review, and visual parity checks: primary Astra agent.

**Goal:** Make `/languages` an immersive full-viewport atlas closely matching `https://map.everylanguage.com/map`, using EveryBible's complete existing collection.

**Architecture:** Retain the authenticated Next dashboard route, snapshot APIs, and MapLibre engine. Replace the document-style atlas composition with a 56px app bar, full-viewport canvas, floating record-kind selector, and responsive inspector. Use controlled map display/projection settings and a single explicit Scripture visualization palette.

**Tech stack:** Existing Next.js 15, React, MapLibre 5.21.1, CSS, Node test runner. No new packages or data acquisition.

## Reference evidence and decisions

Inspected the live reference with browser screenshots and computed DOM styles on 2026-09-05, desktop 1517×890 and mobile 390×844. Detailed status research is in `docs/research/language-atlas/experience-parity-status.md`.

- Header: 56px, white/70% or warm-black/70%, subtle bottom border, Inter/system UI. Brand/menu left; central search max-width 576px, 42px high, radius 12px; theme right.
- Map: canvas x=0,y=56,width=viewport,height=viewport−56. No introductory title, metrics strip, filters, or table consuming map height. No page-level vertical scrolling.
- Desktop inspector: floating right 16px, top 72px, bottom 16px, width 480px; 12px radius, subtle border/shadow. View controls and collection information are inside this panel, which scrolls independently. Header eyebrow 12px; title 18px/600; panel copy 12–14px.
- Record-kind segmented control: floats near top of unobscured map, 32px below header; neutral surface, rounded 8px, 32px active button with muted gold fill. Adapt reference Languages/Regions/People groups to our actual Languages/Dialects/People groups/All dataset kinds.
- Mobile: 56px compact header, compact floating kind tabs, full canvas; inspector is initially a collapsed bottom sheet with a visible grab/expand button around 72px high. Opening controls or a record expands it, with an explicit collapse button. Map remains visible above.
- Default individual dots; an explicit Clustered toggle changes actual source behavior. Preserve map/globe switching. Dot sizes around 3–5px with contrasting 1px outline. Exact overlaps remain honest and inspectable, without coordinate jitter.
- Reference legend colors: Full Bible `#10b981`, New Testament `#eab308`, Portions `#eb6a38`, No Scripture `#ef4444`. Use these consistently in map, legend, list, and profile badges. Unknown is a separate neutral `#94a3b8` state, explicitly labeled; missing dialect evidence must never be painted as No Scripture.
- Preserve internal six-state evidence. `bible`, `nt`, `portions` map directly; `started` and `needed` map to the no-published-Scripture visual category while the inspector retains their exact progress labels. `unknown` stays unknown. Do not copy the reference's Jesus-film-to-Scripture inference or promote inherited language coverage to a dialect claim. No importer/snapshot changes.
- Default inspector tab: Map Controls, so display mode and colors are immediately discoverable. Other panel tabs: Records (accessible searchable list/pagination/export), Collection (counts, provenance, sources). Search opens Records; map/list selection opens the existing rich profile, with a clear back/close control.
- Header search also presents a reference-style popover immediately beneath the input: same width, rounded neutral surface/shadow, up to ten matching names with kind/identifier subtitles and a View all results action. Keyboard arrows/Enter and Escape work; the Records panel remains the complete accessible list.
- Match reference neutral map palette: light white canvas, pale-gray land and blue-gray water; dark near-black canvas/land and slate water. Keep shared analytics palette unchanged; apply atlas-specific basemap colors through a local helper if required.

## Global constraints

- Keep admin authentication, private/no-store APIs, source evidence, retrieval dates, unknown scope, approximate placements, source links, CSV safety, and all 62,832 records intact.
- Full viewport is route-specific. Other admin pages retain their existing navigation/layout. The atlas must provide an accessible Admin menu because its full-page view replaces the visible sidebar.
- No copied donations, login flow, project completion totals, or unsupported live activity from the reference. Use our actual collection data.
- Preserve the style-request cancellation fix and selected-hit/overlap behavior. No public QA route or authentication bypass in production.
- No workers commit or deploy; primary integrates and verifies, then uses the existing separate deployment owner for the already-authorized local-main/Vercel finish.

## Task A: Map engine and palette — Sol High map worker

Own `LanguageMap.tsx`, new map-specific helpers/tests, `model.ts`, `model.test.ts`, and `types.ts` only as needed.

- [x] Add exported `AtlasDisplayMode = 'individual' | 'clustered'`, `AtlasProjection = 'globe' | 'mercator'`, `AtlasMapPadding = {top:number;right:number;bottom:number;left:number}`; exported shared palette/category helpers in a small `presentation.ts` if appropriate.
- [x] `LanguageMap` consumes `{records, selected, onSelect, displayMode, projection, padding}`; all new controls live in the parent UI. Map renders its canvas, loading/error status, hover popup and overlap chooser, with zoom/reset/fit controls if useful. Parent supplies settings and safe padding.
- [x] Add optional `no-scripture` filter semantics covering started+needed, without altering stored evidence or existing exact status filters. Keep unknown distinct and dialect-scope guard intact.
- [x] Implement actual unclustered rendering at all zoom levels, with optional cluster source/layers. Avoid duplicate indexing if `setClusterOptions` supports a reliable transition in the installed version; use official docs. Preserve camera and selection when switching modes, themes, or resizing.
- [x] Add semantic palette and atlas-only basemap appearance. All render layers use the same categorical helper as controls/list. Reference optional cluster radius 50 and max zoom 4; retain inspectable overlaps.
- [x] Make fit/selection respect right/bottom overlay padding. Center the initial globe in the unobscured canvas. Parent padding changes must not reset user zoom/position unnecessarily.
- [x] Regression tests for initial individual mode, mode switching/projection persistence, exact colors, no-scripture grouping, unknown dialect safety, and actual-hit selection.
- [x] Run focused tests and admin typecheck; report changes and integration props to root/UI worker.

## Task B: Viewport shell and inspector — Sol High UI worker

Own `LanguageAtlas.tsx`, `RecordInspector.tsx`, `language-atlas.css`, new atlas UI components/tests; route/layout files only if needed for route-scoped shell and no auth changes. Do not edit Task A files.

- [x] Replace the long document layout with a fixed full-height atlas, slim header/search/admin navigation/theme, floating type tabs and right inspector. Prefer route-scoped CSS using the existing dashboard convention; ensure hidden sidebar controls cannot receive focus.
- [x] Parent controls default displayMode individual and projection globe. Supply padding based on actual desktop panel/mobile sheet state (desktop right about496px, mobile bottom collapsed72px/expanded sheet height) to map.
- [x] Map Controls panel provides clustered switch, Map/Globe selector, country/source/placement filters and clickable five-state legend. Clearly show Individual dots when clustering is off.
- [x] Records panel retains all filters, pagination, selection, loading/error/empty retry, and CSV export. Search should reveal results immediately without hiding the map. Keyboard can reach results/profiles without using dots.
- [x] Profile is a scrollable panel view with existing complete evidence/source/related-record content, back/close control and scope cues. Mobile opens as a sheet instead of scrolling the page away from the map.
- [x] Collection panel contains existing honest counts and provenance/source content. Remove the large intro/metrics/source sections from the outer page.
- [x] Responsive behavior at 1440/960, 768/900 and390/844; 44px practical touch targets, focus management/Escape closure, no viewport overflow, both themes and reduced motion.
- [x] Focused behavior/source tests where meaningful, admin lint/typecheck. Avoid unrelated shell changes.

## Task C: Astra integration and parity gate

- [x] Review code against reference measurements and data-scope rules; fix root causes and coordinate workers.
- [x] Compare live local screenshots to reference at matching desktop/mobile sizes. Measure canvas fills viewport below header, inspector bounds, no body scroll, content usability, and exact legend colors.
- [x] Test actual full collection: initial unclustered dots, cluster toggle, Map/Globe, filter+search, hover/click, overlapping locations, selected profile, keyboard, mobile panel, theme switching, CSV, empty states.
- [x] Run `npm run verify:workspace`, `npm run admin:build`, and focused atlas tests. Snapshot regeneration is unnecessary because this change does not modify the dataset; existing snapshot invariants must still pass.
- [x] Update `docs/admin-language-atlas.md` and this plan with verification evidence.
- [ ] Hand exact verified changes to existing deployment task for local-main integration and Vercel production. Reuse the successful packaging/streaming fixes and preserve unrelated main WIP. Require exact commit READY plus live authenticated viewport/dot/profile verification before saying finished.


## Astra verification evidence — 2026-09-05

- Inspected the implementation and requested corrections to outer-globe color,
  clustering labels, legend visibility, profile typography/chrome, source-evidence
  disclosure, and control placement. Sol workers implemented those corrections;
  Astra rechecked the actual browser result.
- Desktop 1440×960: header 56px, canvas x0/y56/1440×904, inspector
  x944/y72/480×872 with 16px right/bottom margins. No outer document scroll.
  White light-mode and near-black dark-mode canvas match the reference.
- Mobile 390×844: document dimensions remain exactly 390×844; collapsed
  inspector begins at y764, with 72px visible above its bottom margin. Expanded
  inspector leaves an interactive map region above it. Hidden descendants are
  inert and excluded from accessibility navigation. Tablet 768×1024 also checked.
- Actual Clustered switch changed individual points into count bubbles and back;
  Map/Globe, Reset view, both themes and inspector resize all worked. The All
  view showed 62,832 matching records and 61,312 mapped. Existing source locations
  remain intact (86,511 point features); no data files changed.
- Measured legend computed colors: rgb(16,185,129), rgb(234,179,8),
  rgb(235,106,56), rgb(239,68,68), rgb(148,163,184). No Scripture filter returned
  1,915 language records, exactly the 1,435 started plus 480 needed records.
- Tamang search returned eight language results; ArrowUp/Enter opened Western
  Tamang and its full source evidence. Header suggestions, View all, empty query
  result, clear search, record-kind changes, and CSV export were exercised.
- Clicking a crowded Iceland point opened an eight-record overlap chooser.
  Moving across Icelandic Sign Language displayed its hover biography and exact
  Translation started label. Its red point retains the precise underlying claim.
- Mobile lookup for rolv:06601 opened Aari: Biyo with Unknown coverage, separate
  parent Complete Bible context, and explicit parent-location approximation.
  Escape returned focus to the search combobox. Export reported one filtered
  record. Fresh review tab reported no browser console errors.
- `npm run verify:workspace`: PASS (lint/typecheck across workspaces and 1,702
  tests). `npm run admin:build`: PASS; /languages first-load JS 388 kB. The sole
  admin lint warning is the existing layout custom-font warning.
- Seventeen packaged runtime snapshots match their source hashes. The temporary
  local preview route is outside the application, absent from the build; local
  proxy/dev servers stopped. Authentication and public routes are unchanged.
- Local build logs: `/private/tmp/everybible-atlas-parity-verify.log` and
  `/private/tmp/everybible-atlas-parity-build.log`. These are ephemeral QA logs,
  not application dependencies. Browser checks used the real components and
  complete snapshots through a local fixture; production verification follows
  in the existing deployment task.
