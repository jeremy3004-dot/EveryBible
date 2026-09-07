# Atlas-wide naming equivalence — 2026-09-07

The user identified Northern and Southern Kyrgyz/Kirghiz repetitions and requested
this class of reconciliation across the whole atlas, retaining uncertain records.
Three Astra agents at low reasoning handled discovery, independent scope review,
and conservation verification; the lead reviewed the rule and samples, corrected
unsafe normalization, and approved explicit identity groups.

## Applied scope

**3,046 additional pairs reconciled** across 38,061 language/dialect input records:
2,343 Glottolog/ROLV, 677 Every Language/Glottolog, and 26 Every Language/ROLV.
The source namespaces describe the surviving input IDs, not separate counts of
languages. All 54,532 records were inspected; people groups are excluded from joins.

The build now has 51,486 canonical records: 9,795 languages, 25,220 dialects and
varieties, and 16,471 people-group records. There are 5,570 retained alternate IDs
across all passes. Seven existing decision groups gained another source identity;
the manifest has 5,563 groups rather than one group per removed repetition.

Two naming classes are included: 2,179 canonical-label correspondences that also
have direct name/alias overlap, and 867 newly resolved parent-name/order patterns.
An earlier draft incorrectly excluded the first class merely because another
pass had considered it. That artificial ownership exclusion was removed; the
actual identity-conflict checks apply equally to both classes.

## Evidence rule and limits

Names may be compared after removing a source-attested immediate parent name or
alias at a label boundary, or a matching colon prefix. Parent aliases containing
colon-qualified child names are excluded. Matching preserves the remaining full
variety name; it does not delete Group, Nuclear, or nested directional qualifiers.

A controlled direction adjective mapping applies only when the entire remaining
leaf is one of eight cardinal/intercardinal directions: for example north/northern.
It is not a substring replacement. Ninety-one approved pairs use this rule,
including pairs whose two source labels already share the same direction wording.

Formatting normalization retains accents, click symbols and their multiplicity,
apostrophes, brackets and other meaning-bearing characters. Review explicitly
rejected matches that depended on erasing `Ng|u||en` versus `Ng|u|en`, `[[Xo` versus
`||Xo`, and `Pua'` versus `Pua`. No fuzzy transliteration is introduced.

Every approved pair has the same immediate parent and record kind, compatible
country associations and nonempty identifiers/scalars/Scripture claims, unique
primary-label matches, no children, and no existing review flag. Competing aliases
remain a hold except the individually corroborated Kyrgyz China case. Country
associations may be inherited and are not independent proof of dialect geography.
These are reviewed contextual identity correspondences, not provider-declared
identifier crosswalks or an individual external attestation of all 3,046 pairs.

## Kyrgyz result

- `rolv:12042` retains `glottolog:nort2693`: Kyrgyz: Northern / Northern Kirghiz.
- `rolv:26797` retains `glottolog:sout2702`: Kyrgyz: Southern / Southern Kirghiz.
- `rolv:12041` Kyrgyz: China remains separate; Northern and Southern remain distinct.

[GRN's Kyrgyz profile](https://globalrecordings.net/en/language/kir) explicitly
identifies Kirghiz as its ISO name and lists China, Northern and Southern as
separate varieties. [Northern](https://globalrecordings.net/en/language/12042) and
[Southern](https://globalrecordings.net/en/language/26797) leaf profiles corroborate
the exact ROLV codes. The [Northern Glottolog profile](https://glottolog.org/resource/languoid/id/nort2693)
and [Southern profile](https://glottolog.org/resource/languoid/id/sout2702) corroborate
the respective dialect labels. China has a Northern alias, but its separately
named scope and provider relationship are retained rather than merged away.

## Review coverage and exclusions

Independent review checked all 3,046 pairs for current structure and raw Glottolog
parent consistency, finding no mismatch. Sixty stratified pairs were manually
reviewed by the scope reviewer; the lead sampled 50 further rows. Primary-source
investigations and concrete hierarchy traps are in the separate review report.
The final discovery report has 3,600 candidate pairs, of which 554 remain excluded.

The original Glottolog/ROLV queue now has 2,959 unresolved unique pairs across
3,284 rows. This queue overlaps the naming exclusions and is not an exhaustive
count of all potentially duplicated languages. Direction conflicts, parent-child
scope, rival aliases, and punctuation-dependent resemblance remain separate.

Artifacts:

- `reconciliation-naming-candidates.json.gz`: frozen input hash, all candidates,
  exclusions, source rows, labels and transformations.
- `reconciliation-naming-review.md`: independent scope review and counterexamples.
- `reconciliation-naming-decisions.json.gz`: the 3,046 exact additional decisions.
- `data/language-atlas/reconciliation-decisions.json`: integrated build manifest.
- `reconciliation-outcomes.json.gz`: updated original-queue outcomes.
- `reconciliation-naming-validation.json`: final baseline conservation result.

No raw provider source files were edited. Work is local and uncommitted; no
publication or deployment was performed.

## Final verification

All 57,056 original identities resolve uniquely in 51,486 canonical records.
Original Scripture status, scope and parent context are unchanged; aliases and
non-derived positions are preserved. All 16,471 people-group records are identical.
Independent raw-source checks retain all 35,348 active Every Language entity IDs,
70,232 external-ID evidence rows for active entities, and 8,590 coordinate refs.
The other 48 source-ID rows refer to inactive/orphan entities and remain in raw data.

The stricter conservation verifier flagged 12 approximation-only attribution
changes since the original baseline, eight arising in this pass. Original detail
shards were independently checked: each removed contributor occurred only in one
Map placement evidence entry, scoped country, related-people-group or parent-language.
The actual source claims and non-derived positions survive. These changes are
reported separately because replacing a generated approximation with source
geography changes its display attribution; unexplained source losses still fail.

Fresh gates passed: 56 Python tests, 57 relevant application tests, deterministic
admin/public/project snapshot checks, and both production builds. The Kyrgyz
regression failed before the data changes and passes afterward. All 5,563 explicit
decision groups are checked against the resulting canonical and alternate IDs.

The local production browser returns exactly one Northern Kyrgyz profile and one
Southern Kyrgyz profile for both former names/IDs. Kyrgyz: China remains separate.
East/West Kasem and Ngwo/Zang retained IDs also resolve to one corresponding record.
The Northern profile opens correctly; browser console reports zero errors, with
existing map warnings. No published site was changed.
