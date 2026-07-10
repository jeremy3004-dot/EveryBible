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
