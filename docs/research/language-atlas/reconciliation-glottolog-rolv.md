# Glottolog versus ROLV reconciliation audit

Generated 2026-09-07 from the checked-in admin index and detail shards plus the saved registry and current GRN snapshots. The audit covers 40,581 language and variety records and excludes 16,471 people-group records.

## Scope and rules

This is a read-only identity audit. The generated atlas remains unchanged. The saved workbook exposes prior Glottocode pair fields, but its Match Method is name/parent-derived rather than independent identifier proof; no pair is auto-merge eligible. Same-parent ISO, country, normalized names, aliases, and fuzzy spelling are review evidence only; they never auto-merge records.

The current admin index has 9,795 language records and 30,786 dialect/variety records. All 40,581 have detail rows across 16 gzip shards: 40,581 language/variety details were found.
The immutable pre-lead-review baseline had 40,585 language/variety records; the current canonical count is 40,581 (-4) with reviewed merges already present in the checked-out index at audit time.

## Source coverage

Glottolog 5.3 contributes 13,706 dialect rows, 8,618 language rows, and 4,853 family rows. ROLV contributes 12,400 current codes, 12,406 saved codes, and 12,407 unique saved/current codes. The workbook's explicit `rolv_varieties` table has 12,406 rows, and its unified source index has 60,041 rows.
Crosswalk evidence check: **0** independent source identifier pairs. `unified_source_index` has **0** rows containing both Glottocode and ROLV Code; `rolv_varieties` has **12,403** ISO-coded parent links and **5,237** generated Official dialect target fields. The latter retain their original Match Method and remain review evidence only.

## Pair counts

- Explicit crosswalk rows: **5,237** (5,228 distinct Glottocodes). **4,617** are one-to-one, same-parent, non-generic crosswalk review pairs; **85** also have compatible country sets and **4,532** have no Glottolog country evidence. The workbook's Match Method is prior name/parent evidence, so none is auto-merge eligible without independent review.
- Explicit parent/classification conflicts: **30**. Explicit Glottocodes reused by multiple ROLV rows: **9** targets covering **18** rows. Country conflicts: **6**. Generic-label reviews: **574**.
- Same-parent normalized name or alias review pairs beyond the explicit target: **1,768**. These remain manual review candidates.
- Fuzzy spelling review pairs: **950** across **913** ROLV codes. They are queued only, including high similarity scores, because spelling similarity is not identity proof.

## Strong contextual exact-match cohort

The strict contextual review subset has **2,923** pairs across **1,129** parent-ISO cohorts (the broader exact subset had **4,218**). It requires current admin records to share immediate parentId and dialect kind, current exact leaf naming, saved/current ROLV name stability, one exact/alias Glottolog target across all same-parent dialects, one-to-one reverse target across all exact/alias ROLV sources, compatible parent-country geography, current source prefix matching the known Glottolog parent, no existing `needsReview` flag, and no generic directional/standard/nuclear label. **2,510** pairs are in **716** cohorts with multiple matching siblings. This is the strongest batch for Astra review and still has `autoMergeEligible=false` because the underlying workbook crosswalk is name/parent-derived.

The JSON contains 20 deterministic, sibling-count-stratified examples under `contextualExactMatchExamples`; each full row is under `contextualExactMatches` with source fields, current record IDs, and all checks.

## Clear cohort versus review queues

The strongest cohort is the contextual exact-match set above. Country overlap is required there against the Glottolog parent language; missing country evidence is excluded from that strongest subset and retained in the wider explicit review queue.

All same-parent name/alias and fuzzy pairs remain queued. In particular, generic labels such as East/West, Central, Standard, Nuclear, Cluster, Proper, or Coastal are never batch-approved solely from similarity. Parent ISO conflicts, one-to-many mappings, and country conflicts also remain queued.

## Known hard cases

The machine-readable report includes full evidence and IDs for all hard cases. The known Jumli set is preserved: ROLV 26074 Asi, 26075 Chaudhabis, 26076 Paanchsai, and 26077 Sinja. Chaudhabis and Sinja have explicit crosswalk targets; Asi and Paanchsai require review because their source names do not exactly equal the Glottolog leaf names (Assi and Paachsai). The report also includes every explicit one-to-many target, parent conflict, country conflict, generic-label pair, and ambiguous same-name pair.

## Source identity collision note

The Every Language source-link snapshot reuses one GRN/ROLV identifier across multiple distinct source entities for 5,707 codes (up to 3 entities per code). Most are already reconciled in the current generated index; the 25-code `sourceIdentityReuseSample` is diagnostic and should not be read as unresolved atlas duplicates.

See [`reconciliation-glottolog-rolv.json.gz`](./reconciliation-glottolog-rolv.json.gz) for all candidates, source fields, dispositions, and coverage counts.
