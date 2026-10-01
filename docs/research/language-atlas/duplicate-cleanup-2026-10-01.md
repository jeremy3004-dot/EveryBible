# Language atlas duplicate cleanup — 2026-10-01

The owner noticed doubled names on the everybible.app globe, especially in clusters, and asked for every double to be removed. That included near-doubles such as Ngaondéré / Ngaoundere and mis-placed rows such as "Romani, Balkan" in Indonesia.

## Result

| Public globe (languages + dialects) | Before | After |
| --- | ---: | ---: |
| Records | 35,015 | 32,588 |
| Dots drawn | 42,388 | ~34,600 |
| Same-parent dialects with the same name | 985 groups | 7 (distinct Glottocodes) |
| Language rows sharing one ISO code | 5 | 0 |
| Same-name dots within 25 km | 6,917 pairs | 12 (generic labels such as "Aro: East" / "Kombio: East") |

The full atlas went from 51,486 to 49,059 records. No source identity was dropped. Every merged ID stays in `alternateIds`, and a second GRN code stays in `alternateCodes`. `build_atlas.py --check`, the conservation check and all site and admin tests pass.

## What changed

1. **Merges: 2,427 records** (`reconciliation-decisions.json`, `reviewPass: duplicate-cleanup-2026-10-01`).
   - **Same-parent dialects with the same name.** The 2026-09-07 naming pass missed these when the GRN prefix differed from the parent's display name: "Aja: Dogbo" under "Aja (Benin)", or "Bedawi: Ababda" under "Beja". It also excluded rows with competing aliases or review flags.
   - **Spelling and word-order variants under the same parent.** About 550 pairs matched automatically on their distinguishing words, and about 540 more were reviewed by hand. Examples: "Arabic, Gulf: South Qatari" / "South Qatari Arabic", "X: X" / "Nuclear X", accent and apostrophe variants. Different varieties were rejected, such as Mixtec and Zapotec towns, English creoles, and Siraji / Siraji of Ramban.
   - **A merge never joins two different Glottocodes.** Glottolog's curation is taken as proof that two varieties are distinct (Hasoria Bhil / Hasoria Koli, Lun Daye / Lun Dayah).
   - **GRN's duplicate ROLV codes.** Codes like "Ahousaht" / "Ahousaht." merge only through an explicit `allowedCodeConflicts: ["rolvCode"]` on the decision (78 groups).
   - **Same-name language rows with compatible codes (274).** These are mostly code-less Every Language copies of an ISO language.
2. **Source corrections** (`data/language-atlas/record-corrections.json`, applied before merging):
   - Three "Romani, Balkan" rows were tagged with Roma (rmm, Indonesia) or had no code. They are now Balkan Romani (rmn), which already had a Balkan record, so they merge into it.
   - Two "Gamo: Dache" rows were tagged with Manx (glv), which put them on the Isle of Man. They are now Gamo (gmv), merged into GRN ROLV 25035.
   - Olumarachi was aligned with Marama (lrm). Three Zhuang varieties and Standard Malay received their missing macrolanguage parent.
3. **Map dots** (`build_public_atlas.py`, public projection only; the admin index keeps every source placement):
   - Within one record, source points less than 25 km apart draw a single dot. Glottolog and Every Language often supply the same point a few metres apart.
   - A dialect gets no dot when a record with the same specific name is already drawn within 25 km. The same applies to a retired-ISO "Bookkeeping" row beside its current language (Naxi nbf / nxq, Tunen baz / tvu, and three more). This covers about 840 classification disagreements: a language in one source and a dialect in another, or the same variety under a different parent. Current languages always keep their dots. Generic labels (East, Central, Proper…) never count as the same name.
4. **Language pages.** 277 merged-away language pages now permanently redirect to the page of the language they were merged into, using `pages/moved.json`. 15 of them were in the sitemap.

## Left as is

- The 12 same-name pairs above are real different varieties.
- Languages that share a name but have different current ISO codes (e.g. Aari aiw / aiz) are distinct languages.
- Same-name records more than 25 km apart, for example Shuwa-Zamani, where Glottolog and Every Language place the language 660 km apart within Nigeria.
