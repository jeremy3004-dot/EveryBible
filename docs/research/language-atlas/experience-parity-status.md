# Every Language map experience parity

Research date: 2026-09-05. Public source: [Every Language Global Bible Translation Map](https://map.everylanguage.com/map). The downloaded frontend bundle used for verification is `/private/tmp/everylanguage-atlas-research/chunks/map-layout.js` (retrieved during this research). The bundle is minified, so the snippets below are transcribed from its runtime expressions rather than inferred from the current local UI.

## Public map contract

| Behavior | Current public behavior |
| --- | --- |
| Initial layer | `selectionMode: "language"`; language layer active, countries and people groups inactive |
| Initial point mode | `clustered: false` for language and people-group layers, so individual points render by default |
| Toggle copy | Clustered: “Points are grouped into clusters for better performance”; unclustered language: “Show individual language points”; people groups has the equivalent copy |
| Language legend | `Full Bible` `#10b981`; `New Testament` `#eab308`; `Portions` `#eb6a38`; `No Scripture` `#ef4444` |
| Point fields | Language coordinates carry `color`, raw `bible_status`, `bible_status_score`, and media flags in each feature’s properties |

The language point color function has this precedence:

```text
bible_status === 5 OR has_full_audio_bible === true -> #10b981 (Full Bible)
bible_status === 4 -> #eab308 (New Testament)
has_text_portions OR has_audio_portions OR has_jesus_film
  OR bible_status in 1..3 -> #eb6a38 (Portions)
otherwise -> #ef4444 (No Scripture)
```

This means media flags can promote a null or zero status to `Portions`; status 4 still wins over media flags, and status 5/full audio wins over everything. The bundle’s `P()` category helper uses the same four categories (`full_bible`, `new_testament`, `portions`, `no_scripture`). A profile badge calls the top category `Whole Bible`, but the map legend and language popup call it `Full Bible`.

When clustering is enabled, the public source uses `clusterRadius: 50`, `clusterMaxZoom: 4`, and `clusterProperties.sum_score`. Language cluster scores map to 0=`No Scripture`, 2=`Portions`, 3=`New Testament`, 4=`Full Bible`; cluster color is a linear interpolation of `sum_score / point_count`. This is optional behavior because the default is unclustered.

People-group points use the same four colors but evaluate `primary_language_bible_status` and audio/Jesus Film flags. Country polygons have a separate four-label legend (`Mostly Full Bible`, `Mostly New Testament`, `Mostly Portions`, `Mostly No Scripture`) based on the aggregate `bible_status_score`; those country colors should not be reused for language dots.

## Current EveryBible delta

Evidence paths:

- [model.ts](../../../apps/admin/lib/language-atlas/model.ts): `SCRIPTURE_LABELS` currently exposes six values: `Complete Bible`, `New Testament`, `Portions`, `Translation started`, `Translation needed`, `Unknown`. `buildFeatures()` writes `scriptureStatus(record)` to each point.
- [types.ts](../../../apps/admin/lib/language-atlas/types.ts): the six internal `ScriptureStatus` values and separate `scriptureScope` / `languageContextStatus` fields are explicit in the data contract.
- [LanguageMap.tsx](../../../apps/admin/components/language-atlas/LanguageMap.tsx): the GeoJSON source is always `cluster: true`, with `clusterRadius: 42` and `clusterMaxZoom: 16`; there is no public-style cluster toggle. Its legend is derived from all six internal statuses and its dots use local `--series-*` HSL values.
- [language-atlas.css](../../../apps/admin/app/language-atlas.css): local status dots use the six `--series-*` variables, not the public fixed hex values.

`scriptureStatus(record)` deliberately returns `unknown` for a dialect whose `scriptureScope` is not `dialect`. Existing tests in `model.test.ts`, `snapshot.test.ts`, and `scripts/language-atlas/test_build_atlas.py` protect that boundary. This is the correct evidence behavior: an ISO/parent-language translation status does not prove that an individual dialect has Scripture.

The public map colors each coordinate RPC row from its row-level status/media fields. It does not first downgrade a dialect because the entity’s Scripture scope is inherited. Therefore a public orange point can represent location-level evidence while the corresponding EveryBible dialect record correctly remains `scriptureStatus: "unknown"` and stores parent/ISO context in `languageContextStatus`.

## Implementation decision

The live browser inspection confirmed the reference colors, unclustered default,
56px header, full-viewport canvas, floating 480px inspector, and collapsed mobile
bottom sheet. The implementation plan is
[Language atlas experience parity](../../superpowers/plans/2026-09-05-language-atlas-experience-parity.md).

EveryBible keeps the existing source-scoped snapshot as the evidence authority.
The display categories are Full Bible, New Testament, Portions, No Scripture,
and a separately labeled neutral Unknown. Existing `started` and `needed`
progress values share the red display category; the detailed profile continues
to show their exact labels. Unknown remains neutral. Dialects retain the existing
exact-variety scope guard. The data and source evidence remain unchanged.

The reference's audio/film precedence above documents its behavior. EveryBible's
Scripture colors use the verified Scripture status already in the registry;
media resources remain separate attributed evidence. This preserves the four
reference hues while making uncertain coverage visible in our larger collection.

## Verification contract

1. All four reference colors and labels are exact; Unknown is `#94a3b8`.
2. Internal `started`/`needed` values share red presentation and the combined
   No Scripture filter; exact original statuses remain usable in evidence.
3. Dialect parent-language coverage remains Unknown without dialect scope.
4. Individual points are the default; the cluster toggle changes the real
   MapLibre source, retaining every source location and stable identifiers.
5. Mode, projection, camera, and selection survive normal filter/theme changes.
6. The full canvas and responsive inspector match the measured reference
   geometry, with no document-level page scroll or large introductory blocks.
