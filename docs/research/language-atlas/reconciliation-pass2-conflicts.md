# Second conservative pass: conflicts and generic labels

All **722 rows / 722 unique pairs** were categorically audited against current explicit ownership. **No additional merge is proposed: 717 remain separate, and five were resolved concurrently by the lead.** This is full categorical coverage with eight bounded source investigations, not 722 individual linguistic attestations.

| Disposition | Rows |
| --- | ---: |
| ambiguous_one_to_many | 113 |
| country_conflict | 5 |
| generic_label_review | 574 |
| parent_classification_conflict | 30 |

## Ownership and scope

Initial inspection at 2,512 groups resolved none of these pairs. At report generation, 2,520 groups included five newly lead-resolved pairs (ROLV 10196–10200). These are not recommendations by this agent. Across the complete candidate graph, redirecting endpoints through these decisions reduces zero competing source/target sets. The other 717 pairs remain unresolved.

Four conflicting targets already have another canonical owner; five additional targets were concurrently merged with their corresponding ROLV by the lead:

- `rolv:03805~glottolog:wana1271`: target belongs to `rolv:11684`. Preserve that owner and retain the conflicting source separately.
- `rolv:03894~glottolog:vada1239`: target belongs to `rolv:17342`. Preserve that owner and retain the conflicting source separately.
- `rolv:04038~glottolog:mung1268`: target belongs to `rolv:08172`. Preserve that owner and retain the conflicting source separately.
- `rolv:05003~glottolog:kaip1241`: target belongs to `rolv:05118`. Preserve that owner and retain the conflicting source separately.
- `rolv:10196~glottolog:jaga1246`: already resolved by concurrent lead decision to `rolv:10196`; no further action.
- `rolv:10197~glottolog:khor1243`: already resolved by concurrent lead decision to `rolv:10197`; no further action.
- `rolv:10198~glottolog:nyak1258`: already resolved by concurrent lead decision to `rolv:10198`; no further action.
- `rolv:10199~glottolog:phil1244`: already resolved by concurrent lead decision to `rolv:10199`; no further action.
- `rolv:10200~glottolog:uiya1236`: already resolved by concurrent lead decision to `rolv:10200`; no further action.

Of the 574 generic-label rows, **453** have no generic token in either leaf after splitting the ROLV colon prefix. Their trigger occurs in parent text. This is lexical triage, not proof of an identity match. Examples include Bannock and Isleta. The rest retain a generic token in a leaf or need separate label parsing. No batch approval follows.

All 30 parent-classification conflicts retain both assignments. All 113 ambiguous rows retain competing varieties and hierarchy; no choice is made by spelling alone. All five country conflicts preserve their geographic claims. The machine-readable report names every pair and candidate competitor ID.

## Bounded primary-source investigations

Retrieved pages are provider material returned through the web tool on 2026-09-07; some are cached. A failed retrieval is not evidence of nonexistence. Snapshot facts are explicitly identified.

### Balesi

`rolv:11271~glottolog:bale1254`

Glottolog 5.3 returned Balesi as a dialect with ET and SD countries. Snapshot GRN country is SS. A Sudan/South Sudan historical-label explanation is plausible but unverified and does not prove scope identity. GRN page retrieval failed.

Observed: [provider page](https://glottolog.org/resource/languoid/id/bale1254).

Unavailable: [attempted page](https://globalrecordings.net/en/language/11271).

### Kha Phong

`rolv:13490~glottolog:khap1242`

Glottolog 5.3 returned Kha Phong, alternative name Kri, and LA. Snapshot ROLV is VN. Country disagreement remains; GRN retrieval failed.

Observed: [provider page](https://glottolog.org/resource/languoid/id/khap1242).

Unavailable: [attempted page](https://globalrecordings.net/en/language/13490).

### Khufi

`rolv:16654~glottolog:khuf1238`

Returned Glottolog page is version 5.2, lists AF and Khuf/Chuf aliases. Snapshot ROLV is TJ and immediate Glottolog parent is rosh1238. Existing lead hierarchy hold remains; cached web version is not asserted current.

Observed: [provider page](https://glottolog.org/resource/languoid/id/khuf1238).

### Doi

`rolv:17058~glottolog:doii1241`

Glottolog 5.3 returned Doi, country MM and leaf ISO ukk (Muak Sa-aak), whereas candidate ancestor ISO is tlq and ROLV country LA. This adds classification scope uncertainty; retain and flag for future source refresh. GRN retrieval failed.

Observed: [provider page](https://glottolog.org/resource/languoid/id/doii1241).

Unavailable: [attempted page](https://globalrecordings.net/en/language/17058).

### Chatong

`rolv:30788~glottolog:chat1270`

Glottolog 5.3 returned dialect Chatong with VN. Snapshot ROLV country is LA. No independent evidence resolves whether both records cover the same variety. GRN retrieval failed.

Observed: [provider page](https://glottolog.org/resource/languoid/id/chat1270).

Unavailable: [attempted page](https://globalrecordings.net/en/language/30788).

### Kebu Fula

`rolv:09952~glottolog:kebu1245`, `rolv:30007~glottolog:kebu1245`

GRN 9952 identifies verified variety 09952 under Pular fuf, lists Pular: Kebu Fula as an alias, but also lists Pular: Kebu Fula (30007) as a separate sibling. The same provider thus preserves two records; shared alias does not authorize deleting one or assigning the single Glottolog target to either. 30007 and Glottolog retrieval failed.

Observed: [provider page](https://globalrecordings.net/en/language/9952).

Unavailable: [attempted page](https://globalrecordings.net/en/language/30007), [attempted page](https://glottolog.org/resource/languoid/id/kebu1245).

### Bannock

`rolv:00183~glottolog:bann1248`

Glottolog 5.3 returned dialect Bannock and its matching alternate name. Generic trigger comes from Northern in the ROLV parent, not Bannock. GRN retrieval failed, so do not upgrade to identity proof.

Observed: [provider page](https://glottolog.org/resource/languoid/id/bann1248).

Unavailable: [attempted page](https://globalrecordings.net/en/language/183).

### Isleta

`rolv:00216~glottolog:isle1245`

GRN 216 returned verified ROLV 00216, Southern Tiwa tix, Isleta aliases and New Mexico location, separately listing Sandia. Southern is parent text, not the leaf name. Glottolog retrieval failed; stored same-leaf candidate alone remains insufficient for this conservative pass.

Observed: [provider page](https://globalrecordings.net/en/language/216).

Unavailable: [attempted page](https://glottolog.org/resource/languoid/id/isle1245).

## Limits and handoff

Northern Ghale and Seke were reserved for the lead and were not researched here. This pass changes no decisions, source snapshots, application data, or previous report. All exact IDs, original evidence, ownership checks and categorical holds are in reconciliation-pass2-conflicts.json.gz. Balesi and parent-only generic triggers are follow-up leads, not merge recommendations.
