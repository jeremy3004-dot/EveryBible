# MASTER PROMPT — EveryBible Web Platform Upgrade
## Part I: Admin "Mission Control" · Part II: Brand Unification (everybible.app + admin re-skin)

You are upgrading the EveryBible admin dashboard (`apps/admin` in the EveryBible monorepo, Next.js 15.5 App Router, deployed to admin.everybible.app via Vercel — Git-connected, every push to `main` auto-deploys). This is a production app. Work in a git worktree, land on `main` when verified.

A full live + code review was completed on 2026-07-10. Every issue below is verified with root cause. Do not re-litigate the diagnosis; verify each fix yourself.

## Context you must load first
- Read `apps/admin/DESIGN.md` — the "Sacred Editorial Dark" design system (dark-only, `#101113` base, maroon `#C0392B` accent, Cormorant Garamond display / DM Sans UI). All work must stay inside this system. Do not introduce new accent colors except the specified data-viz ramp.
- Key files: `components/AnalyticsGlobe.tsx`, `components/AnalyticsExplorer.tsx`, `lib/admin-data.ts`, `lib/analytics-reporting.ts`, `app/neo-swiss.css` (active stylesheet; `app/globals.css` is largely dead overrides), `app/(dashboard)/layout.tsx`, `app/(dashboard)/feedback/page.tsx`, `lib/operator-chat.ts`, `lib/upstream-sync.ts`.
- Tests: `node --test` style suites live next to sources (`*.test.ts`). Many are source-text assertions — update them alongside code. Verify with the repo's admin build/lint/typecheck commands before landing.
- Supabase migrations live in `supabase/migrations/`. The analytics RPC was last replaced in `20260710102135_harden_analytics_numeric_casts_safe_numeric.sql`. Any SQL change = a NEW migration; never edit an applied one. Apply to the live DB via the Supabase MCP `apply_migration` and commit the same SQL to the repo (watch for version drift between the two).

---

## PHASE 1 — Metric truth: one taxonomy, one denominator (data correctness, do this first)

The analytics page currently shows numbers that contradict each other. Verified inconsistencies:

1. **Subset exceeds total**: "All translations" coverage snapshot shows 377 listeners; filtering to BSB shows 381. Root cause: two incompatible aggregations.
   - All-translations listeners = sum over coordinate-bucket `locationMetrics`, where nearby buckets are merged with `Math.max` (`lib/analytics-reporting.ts` `mapLocationRollupsToMetrics`, ~line 264).
   - Per-translation listeners = `Math.max` accumulator across that translation's country rows (`buildTranslationBreakdown`, ~line 181: `entry.listenerCount = Math.max(entry.listenerCount, row.listenerCount)`).
   - Fix: compute every listener count from ONE source of truth — the SQL RPC. Add explicit fields to the RPC result: `listener_count` (distinct `COALESCE(user_id::text, session_id)`) computed per scope (global, per-translation, per-country, per-location-bucket) INSIDE SQL, so no client-side re-aggregation ever sums or maxes dedup counts. Client displays only; it never derives.

2. **"Countries" isn't countries**: The globe's coverage snapshot "COUNTRIES 68" counts lat/lng buckets, not ISO countries — `AnalyticsGlobe.tsx` computes it from the `metrics` prop, and `AnalyticsExplorer.tsx` (~line 33) passes `analytics.locationMetrics` as `metrics`. The true country rollup (`analytics.countryMetrics`) is never given to the globe. "ACTIVE LOCATIONS 69" metric card counts the same bucket array — two cards, same underlying number, different labels. Fix: pass both; "Countries" = distinct ISO codes from country rollups; rename the bucket count "Active locations"; delete one of the duplicate surfaces.

3. **"Mapped points" mislabeled**: translation table column shows `translation.locationMetrics.length` (coordinate buckets) while the same translation's snapshot shows country count (68 vs 12 for BSB). Label it "Map buckets" or show countries — pick one meaning.

4. **Windowed vs all-time**: "Average engagement (all-time)" sits among windowed cards. Keep it, but visually tag it (e.g. small "all-time" badge) so the taxonomy is explicit.

5. **418 vs 377**: "Users with listening 418" (all audio events) vs snapshot listeners 377 (geo-located only). After fix #1 these become "Listeners (total)" and "Listeners (located)" — label them as such, same denominator basis.

Deliverable: a single documented metric taxonomy (comment block in `lib/analytics-reporting.ts` + a `METRICS.md` section in `apps/admin/DESIGN.md` or adjacent), every displayed number traceable to one RPC field, invariant tests: per-translation listeners ≤ total listeners; filtered country count ≤ total; sum of per-translation download units == total (downloads are summable; listener dedup counts are NOT — assert accordingly).

## PHASE 2 — The globe becomes the hero ("mission control" moment)

Current state (verified): Carto `dark-matter-gl-style` basemap on the dark theme renders near-black land on near-black ocean — the map is invisible at first paint. Initial camera `[12, 18]` zoom 3.3 (the Sahara — nowhere near the data; #1 country is Nepal). `map.setProjection({type:'globe'})` only fires on `style.load`, so first frame is a flat black mercator rectangle. Marker radius/color interpolation exists (8→34px, pale-blue→red over `safeMax`) but data skew pins everything except the single max bucket at the tiny/pale end. `dragRotate` and `scrollZoom` are disabled. No atmosphere/glow. Check whether `maplibre-gl/dist/maplibre-gl.css` is imported anywhere — the nav control/popup styling depends on it.

Build this (staying in the Sacred Editorial Dark palette — deep charcoal ocean, land elevated a full luminance step, maroon-family heat ramp):

1. **Custom basemap contrast**: don't accept Dark Matter's defaults. After style load, override paint: ocean `#101113` (page base so the globe floats on the page), land `#22262e` (clearly above ocean), country borders `rgba(245,242,234,0.14)`, labels muted `#a09b93`. Alternatively ship a minimal self-hosted style JSON. Land must be readable at arm's length in a screenshot.
2. **Atmosphere + presence**: enable the globe atmosphere/halo (MapLibre `setSky`/`setLight` equivalents in v5) with a faint warm rim (`rgba(192,57,43,0.25)` maroon glow) so the sphere reads as an object, not a hole in the page.
3. **Camera opens on the story**: compute the data centroid (weighted by listening minutes) and `flyTo` it after the first data render — Nepal-heavy data should open over South Asia. Add a slow idle auto-rotate (~6°/min) that pauses on pointer enter/interaction and resumes after 10s idle. Re-enable `dragRotate` and `scrollZoom` (with `cooperativeGestures` if needed).
4. **Magnitude you can see**: switch marker scaling from linear to sqrt/log over the value range so mid-tier countries are visibly mid-tier. Heat ramp: pale parchment `#d0c2af` → warm amber `#d4912a` → maroon `#C0392B` → bright `#e05050` for the max (replaces the current blue→red rainbow which fights the design system). Bubble + soft glow (two circle layers, blurred under-layer) instead of hard dots.
5. **Arcs (the wow layer)**: animated great-circle arcs from a "distribution origin" (configurable; default the top country) to each active country, drawn with the maroon accent at low opacity, pulse animating outward. Keep it subtle — editorial, not gamer. Implement with a MapLibre line layer over great-circle interpolated coordinates (no deck.gl unless bundle cost is justified — measure it).
6. **First-paint experience**: skeleton shimmer over the map container until `style.load` + first data layer, then a 400ms fade-in. Never show the black void.
7. **Filter sync polish**: chip selection already syncs with tables. Add: clicking a country row in the table flies the camera to that country; the selected translation's chip row collapses zero-value translations behind a "+N more" expander (15 chips where 11 are zeros currently bury the signal).
8. Keep the country-card popup; add reading minutes to it (it already shows listening/downloads/listeners).

## PHASE 3 — Layout & system fixes

1. **Exploding sidebar** (worst visual bug, breaks /feedback, /translations, /langquest): the `.dashboard-shell` grid row stretches to content height, the sidebar flex column stretches with it, and the footer's `margin-top:auto` lands off-screen with nav items distributed down the page. Fix in `neo-swiss.css`: make the sidebar `position: sticky; top: 0; height: 100vh; overflow-y: auto; align-self: start` — it must never exceed viewport height; nav scrolls internally if needed. Verify on /feedback (tallest page).
2. **Kill the dead stylesheet**: `globals.css` and `neo-swiss.css` both define `.dashboard-shell`, `.dashboard-sidebar`, `.filter-form`, etc. — later import wins, half of globals.css is dead. Delete the dead rules from `globals.css` (keep resets/fonts), single source in `neo-swiss.css`.
3. **Feedback table overflow**: the Resolution column (note input + "Mark fixed") clips off-viewport with no scroll affordance. Fix: visible scroll shadow/affordance on `.table-wrap`, `min-width` on the resolution input rather than 100%, and make Resolution a sticky right column OR move mark-fixed into a row-expand drawer.
4. **Filter form**: 8 stacked full-width controls consume the first viewport on /feedback. Compact into a responsive grid (2 rows max at 1400px), auto-submit on change (server component form → keep the button as progressive enhancement).
5. **Metric grid orphan**: `.metric-grid` is `repeat(6, 1fr)` with 7 cards — the 7th orphans onto its own row. Use `repeat(auto-fit, minmax(170px, 1fr))`.
6. **Tabular numerals**: metric values render in Cormorant Garamond with old-style figures — gorgeous but wrong for data. Apply `font-variant-numeric: tabular-nums lining-nums` to metric values and table number cells (keep Cormorant for headings).
7. **Empty states everywhere**: audit tables (overview + settings), sync-history table, devices table currently render headers with zero rows silently. Add a styled empty-state row ("No admin actions recorded yet — actions appear here when you publish, sync, or moderate.") — the design system has an EmptyState pattern in the reader app to echo.
8. **Feedback reviewer identity**: stop showing raw UUIDs as the sub-label; resolve `user_id` → profile display name (service-role join in `listChapterFeedback`), show UUID only in a tooltip/copy affordance. Add a "hide test data" default filter (exclude `participant_role = 'Test church'` pattern and `@example.com` reviewer emails) with a toggle to reveal.

## PHASE 4 — Pipelines: make the zeros real numbers

1. **Upstream translation sync is dead**: exactly one recorded run (May 15, failed, HTTP 500), never retried, so all 216 catalog rows show "Not versioned yet"/"Not set". First debug WHY it 500s (`lib/upstream-sync.ts` — check `UPSTREAM_API_BASE_URL`/`UPSTREAM_API_KEY` env on Vercel, hit the endpoint manually). Then: add retry-with-backoff inside a run, a Vercel Cron (`vercel.json` crons → a route handler) for daily sync, failure alerting into the health snapshot with the actual error message, and a "Retry now" affordance on the failed-run row.
2. **LangQuest zeros**: `enqueueLangQuestDiscovery` short-circuits when `TRIGGER_SECRET_KEY` is missing (writes `trigger.skipped` workflow event, UI shows nothing happened). Surface configuration state in the UI: if the env is missing, show a clear "Trigger.dev not configured — set TRIGGER_SECRET_KEY" banner instead of silently queueing. Verify env presence on Vercel.
3. **Daily content ownership (updated September 5, 2026)**: manage the mobile verse and picture rotation in the Codex workspace. The mobile Home screen uses bundled resources. Remove the admin daily-content editors, counters, and alerts; do not seed entries or add scheduling screens. Preserve existing content records, storage, and public feeds. See the daily-content workflow in `README.md`.
4. **Audit trail**: wiring is correct (12 writer call sites) — it's empty because no mutations have run. After Phase 4 mutations execute, verify rows appear. Keep the Phase 3 empty state for the zero case.
5. **Devices always 0**: `user_devices` is only populated by mobile push-token registration. Confirm whether the mobile app actually writes it; if it doesn't, either wire that in the app (separate task — note it, don't do it here) or drop the Devices column/card from support pages rather than showing a permanently-zero metric.

## PHASE 5 — Intelligence layer (the million-dollar differentiator)

1. **Upgrade the Operator AI**: it's currently OpenAI `gpt-4o-mini` with a canned context of 7 integers + last 5 audit rows — it cannot answer anything real. Rebuild on the Anthropic API (model `claude-sonnet-4-6`; env `ANTHROPIC_API_KEY`) with proper tool use: define read-only tools (`get_analytics_overview(windowDays)`, `list_translations(filter)`, `get_translation_detail(id)`, `list_chapter_feedback(filter)`, `get_support_user(email)`, `get_health_snapshot()`, `list_audit_logs(limit)`) that call the existing functions in `lib/admin-data.ts` under the caller's verified admin identity. Streaming responses. Strictly read-only — refuse mutations, point at the UI. Keep the localStorage chat history pattern.
2. **Daily digest**: a Vercel Cron that composes "yesterday in EveryBible" (new listeners, top country movement, feedback needing review, sync health) and stores it; surface as a card on Overview. (Email/Telegram delivery = later, out of scope.)
3. **Anomaly flags**: simple SQL checks in the health snapshot — listening minutes dropped >50% day-over-day, a translation's first-ever activity (celebrate it), feedback needs-work items older than 7 days.

---

# PART II — BRAND UNIFICATION: everybible.app premium redesign + admin re-skin

A live + code brand audit was completed 2026-07-10. The product currently ships **three unrelated brand systems**:

| Surface | Background family | Accent | Display / body type |
|---|---|---|---|
| Mobile app ("Illuminated") | warm ink `#161412`, surface `#1E1B18`, text `#F2EDE3`/`#A8A094` | ember `#D96C57` (+soft `#E08573`, warm-neutral `#A39B8F`, parchment `#d0c2af`) | serif reader, warm |
| everybible.app | cream `#ece8e0`, card `#f5f1e8` | **blue `#0099e5`** (+navy `#005f8f`/`#00405f`, tan `#e2e2c7`, red `#c72a37`) | Fraunces / Noto Sans |
| admin.everybible.app | cool charcoal `#101113`/`#17191d` | **maroon `#C0392B`** | Cormorant Garamond / DM Sans |

The mobile app is the brand. Its ember terracotta is the target for everything. The goal is the feel of the Claude app translated to the web: warm ivory light surfaces, warm ink dark surfaces, ONE terracotta accent, soft contemporary serif display type, generous whitespace, restrained motion — quiet, tactile, premium. Nothing decorative that doesn't earn its place.

## Verified audit findings — everybible.app (live, 2026-07-10)

1. **Wrong brand entirely**: blue logo mark, blue gradient "Get the App" CTA, blue italic hero line ("Every Language."), blue links throughout — nothing terracotta anywhere. The dark ember app screenshot in the hero visibly clashes with the pale blue/cream page around it.
2. **Palette chaos across sections**: cream header → pale-blue-gradient hero → cream feature cards → navy `#005f8f` verse-of-day band (notebook-grid texture) → pale celery-tan `#e2e2c7` download section → cream footer. Plus a red-dot chip (`#c72a37`). Five unrelated section moods on one page.
3. **Hero device mockups half-empty**: one real app screenshot flanked by two EMPTY black phone slabs — reads unfinished.
4. **Static pages orphaned**: `/about`, `/privacy`, `/terms`, `/support` render with NO site header/nav (`components/StaticPageLayout.tsx` has none) — only a "Back to homepage" text link.
5. **"Admin" link exposed in the public footer** (`lib/site-links.ts` presumably) — internal tooling shouldn't be advertised on the marketing site.
6. **Dead stylesheet**: `apps/site/app/neo-swiss.css` (1,253 lines) is never imported — `app/layout.tsx` imports only `globals.css`. Same dual-stylesheet rot as the admin.
7. **Main-thread jank**: during review, script injection into the homepage repeatedly timed out ("page is busy") — profile the homepage for a long-running animation/script loop (check `HeroDeviceStack.tsx` / `VerseDeviceFrame.tsx` and any rAF loops) and fix before adding new motion.
8. Typography foundation is actually good: Fraunces display + serif hero is close to the premium direction already; the problem is color, section cohesion, and finish, not the type family.

## PHASE 6 — One brand token source

1. Create a shared token package: `packages/brand/` exporting the unified palette as CSS custom properties (one `tokens.css`) + a TS module. Both `apps/site` and `apps/admin` import from it. Single source of truth, no more per-app drift.
2. **The unified "Illuminated" web palette** (derives from `src/constants/colors.ts` in the mobile app — verify against it, it is the source of truth):
   - Accent: ember `#D96C57`, hover/soft `#E08573`, pressed/deep `#B85441` (derive), subtle tint `rgba(217,108,87,0.10)`
   - Dark family (admin + site dark sections): bg `#161412`, surface `#1E1B18`, elevated `#262220`, divider `rgba(242,237,227,0.08)`, text `#F2EDE3`, muted `#A8A094`, dim `#857D72`
   - Light family (site): bg ivory `#F2EDE3` / deeper `#ECE6DA`, card `#FAF6ED`, border `#D8D1C2`, ink text `#26221E`, muted `#74706A`
   - Support: parchment `#d0c2af`, amber `#d0a35a`, success `#80c16f`, error `#ff7b72` (dark) / `#c0392b`-family red for light-surface errors
   - NO blues anywhere. The old `--primary #0099e5`, `--brand-lightblue`, navy gradients, and `--brand-tan #e2e2c7` are deleted, not aliased.
3. Typography unification: **Fraunces** (display, all surfaces — including replacing Cormorant Garamond in the admin) + **DM Sans** (UI/body, all surfaces) + JetBrains Mono (data/mono). Tabular lining numerals for all metrics/data. If Fraunces proves too heavy for admin data density at small sizes, it stays display-only (headings) — body/data never in serif.
4. Recolor the logo mark from blue to ember (`#D96C57`) — SVG recolor + regenerate favicons/OG images/app-store badge assets that embed it.

## PHASE 7 — everybible.app premium redesign ("the Claude feel")

Keep the existing information architecture (hero → features → verse of day → download → footer) and copy (`lib/homepage-content.ts` — light edits allowed). This is a re-skin + finish pass, not a rebuild.

1. **Hero**: warm ivory ground (`#F2EDE3`), ink display type, the italic accent line in ember (not blue). CTA = ember solid button with the existing `--edge-highlight` inner-light treatment (already in globals.css — keep it, it's a premium touch). Chip: ember dot + warm-neutral outline. Subtle paper-grain texture (CSS, <2KB) instead of the notebook grid.
2. **Device mockups**: fill all three phone frames with real app screenshots (Home, Reader, Verse of Day — capture from the current app), or drop to a single centered device. No empty slabs. The dark warm-ink app screens will finally look native on the warm ivory page.
3. **Verse-of-day band**: replace the navy gradient with the app's dark warm-ink (`#161412` → `#1E1B18` gradient) so the band IS the app's dark mode — verse text in `#F2EDE3` serif, reference in parchment, CTA in ember. This is the moment the site and app visibly become one product.
4. **Download section**: kill the celery-tan; warm ivory continuation, refined QR card (small ember-tinted frame, soft shadow), store badges unchanged (they're mandated assets).
5. **Section cohesion**: two moods only — warm ivory and warm ink. Alternate them deliberately (ivory hero/features → ink verse band → ivory download/footer). Consistent `--pad-x`/max-width rhythm, generous vertical space (Claude-style: whitespace is the luxury).
6. **Motion**: one system — 150–240ms `cubic-bezier(0.22,1,0.36,1)` (already tokenized), subtle scroll-reveal (opacity+8px translate, once), hero device gentle float. Respect `prefers-reduced-motion`. FIX the existing main-thread jank first (finding #7 above).
7. **Static pages**: give `StaticPageLayout` the site header/nav + footer. Remove the "Admin" link from the public footer.
8. **Hygiene**: delete the dead `apps/site/app/neo-swiss.css`; consolidate all tokens to the `packages/brand` import; verify OG/social cards and favicon reflect the new brand; Lighthouse pass ≥90 performance/accessibility after the redesign (check contrast: ember on ivory needs ≥4.5:1 for text-size usage — use the deep ember `#B85441` for text links on light).

## PHASE 8 — Admin re-skin to the unified brand

The admin's "Sacred Editorial Dark" structure, layout, and component patterns stay. Only the palette + display font move to the unified system:

1. Swap the maroon accent family in `apps/admin/app/neo-swiss.css`: `--accent #C0392B → #D96C57`, `--accent-light #d94f3d → #E08573`, `--accent-strong #a0301f → #B85441`, `--accent-dim → rgba(217,108,87,0.12)`. Keep `--accent-warm #d0c2af` (already parchment, already on-brand).
2. Warm the neutrals to the app's family: `--bg #101113 → #161412`, `--bg-surface #17191d → #1E1B18`, `--bg-elevated #1d2026 → #262220`, borders from cool `#262a31` to warm `rgba(242,237,227,0.10)`, text `#f5f2ea → #F2EDE3`, muted `#a09b93 → #A8A094`. (These are small shifts — verify no contrast regressions in tables/status pills.)
3. Display font Cormorant Garamond → Fraunces per Phase 6 (data stays DM Sans + tabular numerals from Part I Phase 3).
4. The globe heat ramp from Part I Phase 2 becomes: parchment `#d0c2af` → amber `#d0a35a` → ember `#D96C57` → deep `#B85441`; atmosphere rim glow `rgba(217,108,87,0.25)`.
5. Status colors align to the app: success `#80c16f`, warning `#d0a35a`, danger `#ff7b72`.
6. Update `apps/admin/DESIGN.md` to document the unified system (it becomes the reference for both web apps, pointing at `packages/brand`).

---

## Execution rules
- Phases are ordered by dependency: 1 (truth) → 2 (globe) → 3 (layout) → 4 (pipelines) → 5 (AI) → 6 (brand tokens) → 7 (site redesign) → 8 (admin re-skin). Phase 6–7 (site) can run in parallel with Part I if worked in a separate worktree, but Phase 8 MUST come after Phase 3 (they touch the same admin CSS) and after Phase 6 (needs the token package). Commit per phase with the repo's commit style, run the admin test suites + typecheck + lint before each commit, and verify each phase in a real browser (localhost against production Supabase READ paths only; never mutate production data during verification except the explicitly listed seeding tasks).
- Part II visual verification: screenshot every section of everybible.app and every admin page after re-skin; check light-surface contrast ratios (ember text-on-ivory must use the deep variant); verify both Vercel projects deploy green (`everybible-site` and `everybible-admin` both auto-deploy from `main`).
- Update the source-text assertion tests (`page.test.ts` etc.) alongside every change; add new invariant tests for Phase 1.
- Do not add heavy dependencies without measuring bundle impact (`maplibre-gl` is already ~250KB gz; deck.gl would double it — only if arcs genuinely need it).
- The SQL RPC change in Phase 1 is a new migration applied BOTH to the live DB (Supabase MCP) and committed to `supabase/migrations/`. Bump carefully; check `list_migrations` for drift first.
- Anything you discover that's out of scope: note it in the final report, don't chase it.
- Definition of done per phase: the specific numbers/pixels called out above are fixed on the deployed site (push to `main` → Vercel auto-deploys admin), verified with a fresh browser session and screenshots.
