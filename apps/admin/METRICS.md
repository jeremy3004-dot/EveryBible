# EveryBible Admin — Analytics Metric Taxonomy

Every number on `/analytics` traces to exactly **one** field of the
`get_admin_analytics_overview` RPC. The client renders RPC values; it never
re-derives a listener or country count by summing or max-ing rows. This is the
Phase 1 "one taxonomy, one denominator" contract — the guardrail against the
old bug where a filtered subset (BSB, 381) exceeded the whole (377).

## Listener counts (dedup basis: `DISTINCT COALESCE(user_id::text, session_id)`)

| Display | RPC field | Meaning | Invariant |
|---|---|---|---|
| **Listeners · total** (metric card) | `userCountWithListening` | Distinct listeners across ALL audio in the window, geo or not. | The universe. |
| **Listeners (located)** (globe coverage) | `locatedListenerCount` | Distinct listeners whose audio resolved to a map location. | `<= userCountWithListening` |
| **Listeners** (per translation, table + filtered globe) | `translationListenerCounts[t]` | Distinct listeners of one translation. | `<= userCountWithListening` |
| **Listeners** (per country, country table) | `countryMetrics[].listenerCount` | Distinct listeners in one country. | per-country, not additive |

Listener counts are **dedup counts, not sums** — you cannot add them across
countries or translations (the same person can appear in several). Only the RPC
computes them; `buildTranslationBreakdown` takes `translationListenerCounts`
verbatim and never max-merges country rows.

## Country vs location

| Display | RPC field | Meaning |
|---|---|---|
| **Countries** (globe coverage) | `activeCountryCount` | Distinct ISO countries with activity. |
| **Active map locations** (metric card) | `activeLocationCount` | Distinct approximate lat/lng buckets — several per country. |
| **Map buckets** (per-translation table) | `translationLocationMetrics[t].length` | Coordinate buckets for one translation (NOT countries). |

"Countries" (`activeCountryCount`) and "Active map locations"
(`activeLocationCount`) are different denominators — the old globe showed the
bucket count under a "Countries" label, which is why it read 68 when there were
only 12 countries.

## Summable totals (safe to add)

`listeningTotalMinutes`, `readingTotalMinutes`, `totalDownloadUnits`,
`totalTrackedSessions`, and all `daily*` series are plain sums and are additive.
Download units in particular sum across countries/translations to the total.

## Windowed vs all-time

Everything above is scoped to the selected time window **except**
`averageEngagementScore`, which is precomputed nightly across all history and is
labeled "(all-time)" in the UI to keep the taxonomy explicit.

## Invariants (enforced in `analytics-reporting.test.ts` + verified in SQL)

- `locatedListenerCount <= userCountWithListening`
- every `translationListenerCounts[t] <= userCountWithListening`
- `sum(per-translation downloadUnits) == totalDownloadUnits` (downloads are summable; listener dedup counts are NOT)

## Activity atlas (September 2026)

The four headline totals and daily charts always cover all translations in the
selected window. The translation dropdown filters the atlas and country table;
a separate translation summary makes that scope explicit. Country selection
focuses the map and inspector, and highlights its table row.

- Country details and rankings use genuine `countryMetrics` or the selected
  translation's `countryTableMetrics`. Never use coordinate buckets as country
  totals or sum their listener counts.
- Listening and downloads use available location buckets. Reading also uses collected approximate location buckets. Country-only activity
  is shown as the additive remainder at the country center.
- `locationKind` distinguishes `approximate` IP buckets from `country` fallback
  placements. They remain separate even when coordinates match. No city names,
  GPS precision, or individual identities are inferred.
- Heat mode shows relative spatial density with log-normalized activity weights;
  overlapping points intensify. Points mode shows per-bucket magnitude on a log
  scale. Each selection rescales to its own maximum, so colors are not absolute
  comparisons across filters.
- Country share uses the sum of country-attributed values for the selected
  additive metric, not the global total that also includes unlocated activity.
- CSV exports include only searched rows in their current sort order. Text that
  could be interpreted as a spreadsheet formula is escaped.
- Daily values are shown on a UTC calendar axis, with absent dates inside the
  reported series shown as zero. The current day can be incomplete.
- The server supplies `retrievedAt` for the source line. Engagement's separate
  all-time computation timestamp remains visible.

## Collection and reporting contract (schema 2)

- `analytics_schema_version: 2` in new mobile event properties identifies elapsed
  listening time. Older `listened_ms` was elapsed time multiplied by playback
  speed; `analytics_listened_ms` divides legacy values by their recorded rate.
  Old raw events remain unchanged. The dashboard, engagement refresh and retained
  rollups use the same conversion.
- `totalTrackedSessions` counts distinct `session_started.session_id` values for
  app visits, including reading-only visits. It no longer counts audio sessions.
- A listener must have positive listening time. Accounts are deduplicated by
  verified user ID, signed-out activity by session ID. Neither is a reliable
  count of unique people across devices or visits.
- `translationTotals` includes unlocated reading and downloads. Country rows are
  geographic subsets and must never substitute for complete translation totals.
- Location coordinates are rounded to 0.1 degrees **before SQL aggregation** so
  per-bucket listener counts are distinct at the actual displayed grain.
- All windows include today and start at UTC midnight `N - 1` days ago. Totals
  and daily series share that interval. Minute series round to tenths and headline
  totals to whole minutes, so small rounding differences are expected.
- `collectionHealth` reports event and location coverage counts, event types,
  latest occurrence time, and latest receipt time. Historical receipt timestamps
  are unknown and fall back to occurrence time; new events store both.
- Approximate network location may reflect a VPN, carrier gateway, or upload
  network. No device GPS or hardware identifier is collected. An IP provider's
  decimal coordinates are not evidence of street-level accuracy. Unknown
  accuracy stays null instead of a fabricated kilometer radius.

See `docs/analytics-collection-audit.md` for the audit and release order.
