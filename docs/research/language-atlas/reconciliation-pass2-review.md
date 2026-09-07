# Conservative second reconciliation pass — 2026-09-07

The user requested another pass over uncertain identities, explicitly retaining
records when in doubt. Three Astra agents at low reasoning handled exact matches,
aliases/spelling, and conflicting/generic candidates. The lead reviewed positive
recommendations and requested separate conflict checks before applying them.

## Outcome

**12 additional pairs reconciled; 5,151 uncertain unique pairs remain separate.**
No original source file or people-group record was deleted or changed. All original
IDs remain resolvable, including the Glottolog IDs consolidated in this pass.

| Corresponding records | Pairs | Added evidence |
| --- | ---: | --- |
| Northern Ghale: Jagat, Khorla, Nyak, Philim, Uiya | 5 | GRN's complete named cohort and Glottolog's indexed Webster survey |
| Seke: Chuksang, Tangbe, Tetang | 3 | GRN's explicit parent-name equivalence and ELA village-dialect documentation |
| Ngaliwurru, Bilinarra, Juwaliny, Binbinka | 4 | Distinctive aliases in official GRN rows and observed Glottolog profiles |

Each row consolidates repeated registry representations of a variety; the five
Ghale varieties and three Seke varieties remain distinct from one another.

The Northern Ghale generic-label trigger came from the parent word Northern,
not the village name. [GRN](https://globalrecordings.net/en/language/ghh) lists the
five varieties; [Glottolog's Webster bibliography](https://glottolog.org/resource/reference/id/649669)
corroborates their survey context, using Korla for Khorla. Approximate shared
coordinates add no independent identity evidence.

For Seke, [GRN](https://globalrecordings.net/en/language/skj) explicitly equates
Seke with Seke (Nepal), resolving the earlier prefix mismatch. The
[Endangered Language Alliance](https://www.elalliance.org/languages/seke) describes
distinct village dialects including Chhusang, Tangbe and Tetang. ELA lists five
villages: the three reconciled registry leaves are not an exhaustive inventory.

The Australian records share two or more distinctive aliases. Exact GRN code and
alternate-name rows were inspected and their hashes checked against the September
5 manifest from GRN's GraphQL endpoint. Live Glottolog profiles corroborate the
aliases and Australia. These are contextual identity correspondences, not explicit
provider-declared Glottocode/ROLV crosswalks. The failed live GRN HTML fetches are
recorded; official saved GRN evidence supplies that side of the comparison.

## Coverage and conservative holds

The prior queue contains **5,550 rows / 5,163 unique pairs**. Some pairs appeared
under both alias and fuzzy dispositions. The teams categorically checked every
row, then performed bounded external research on the strongest leads; this is
not an individual scholarly determination of every uncertain pair.

- Exact queue: 2,112 rows/pairs, including 408 earlier strict-context candidates;
  three detailed investigations, no worker proposals. The lead separately approved
  the three Seke pairs.
- Alias/fuzzy queue: 2,716 rows / 2,329 pairs; four detailed multi-alias cases
  approved, 2,325 other pairs retained.
- Conflict/generic queue: 722 rows/pairs; eight detailed source investigations;
  five Ghale pairs approved separately by the lead, 717 others retained.

Twelve approved pairs remove 16 candidate rows because four Australian pairs each
appeared in two dispositions. The remaining queue is **5,534 rows / 5,151 pairs**.
It includes likely duplicates, unresolved classification, and false-positive
similarities; its size is not a count of established duplicates.

Solukhumbu remains separate from both Solu and Khumbu because the proposed scope
is not one-to-one. Nubri/Lho and Newari/Baglung retain their differing hierarchy.
Kebu Fula's two GRN records remain separate because GRN itself lists them as
siblings. Country conflicts and already-owned targets were not reassigned.

A generic token appears only in the parent text for 453 of 574 generic-flagged
rows. This suggests useful future review candidates, but does not authorize a
batch merge. Doi's fetched Glottolog classification also differs from the saved
ancestor association; this remains a source-refresh question, not a forced join.

## Artifacts and verification

- `reconciliation-pass2-lead.json`: 12 exact approved pairs and rationales.
- `reconciliation-pass2-exact.json.gz`, `reconciliation-pass2-alias.json.gz`,
  `reconciliation-pass2-conflicts.json.gz`: categorical coverage and source evidence.
- `reconciliation-outcomes.json.gz`: updated outcomes, with row and unique-pair counts.
- `reconciliation-pass2-validation.json`: baseline conservation check.

The rebuilt atlas has 54,532 records: 9,795 languages, 28,266 dialect/variety records,
and 16,471 people-group records. All 54,544 previous canonical IDs and all previous
alternate IDs resolve uniquely. Scripture status, scope and parent context are
unchanged; people-group records are identical. All 51,668 non-derived location
occurrences checked against the previous snapshot survive (occurrences can share
coordinates across records).

Work remains local and uncommitted. No deployment was performed.

Fresh verification passed: 42 Python regressions, 55 relevant application tests,
deterministic admin/public/project rebuild checks, and both production builds.
The new snapshot regressions failed before reconciliation and passed afterward.
On the locally built production site, each of the 12 retained Glottolog IDs returns
exactly one canonical record; the Chuksang profile opens correctly. Browser console:
zero errors (existing map warnings remain). The initial local-preview approval
review timed out; its permitted retry succeeded, so no verification gate remains.
