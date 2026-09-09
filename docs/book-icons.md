# Bible book icons

The set contains 57 original vector drawings mapped to all 66 Protestant Bible books. Numbered books share the same stored drawing; the Gospel of John has its own artwork.

## App use

`BookIcon` in `src/components/bible/BookIcon.tsx` renders precompiled paths through the existing `react-native-svg` dependency. Its default color follows `colors.biblePrimaryText`; callers can supply `color` for unavailable-book styling. No raster source, XML parsing, tracing library, network fetch, shadow, or filter is needed at runtime. The browser, chapter selector, reader, audio card, and companion card use this component.

The standalone files in `assets/book-icons-vector` have transparent backgrounds and use `currentColor`. For external SVG use, set the SVG's CSS color (or replace `currentColor` with the desired foreground). Native path data lives in `src/constants/bookIconVectors.generated.json`; do not edit it by hand.

## Rebuild and review

Raster authoring originals, prompts, earlier revisions, and the offline preview are in `output/imagegen/full-book-icons-2026-09-09` and are excluded from the mobile bundle. The first three approved references are in the adjacent `book-icons-2026-09-09` folder. Generation used the built-in image tool, which does not expose a model selector, so no specific model version is asserted.

Conversion is authoring-only. Install `potrace@2.1.8` and `svgo@4.1.0` in a separate tools directory. The repository supplies Sharp. Then run from the repository root:

```sh
node scripts/generate-book-icon-vectors.cjs /path/to/tools output/imagegen/full-book-icons-2026-09-09
node scripts/compile-book-icon-vectors.cjs
node scripts/preview-book-icon-vectors.cjs
node --test --import tsx src/constants/bookIconVectors.test.ts
```

`catalog.json` records all book names, concepts, and aliases. When changing a concept, keep the authoring and asset catalogs in sync. Review every SVG in light and dark modes and at the preview's 32px and 48px sizes. Small icons convey the silhouette; details such as Revelation's seals need a larger presentation to count.

Accepted corrections: Peter uses crossed keys, the John letters use a heart with a flame, Philemon uses only a handshake, and Revelation's scroll has exactly seven seals, counted again after vector conversion.

Automated checks cover all 66 mappings, shared identities, native/SVG consistency, transparent themeable paths, a 20 KB per-file limit, a 600 KB set limit, and path complexity. These limits reduce asset cost but are not a substitute for performance measurements on older physical Android phones.

Five subsequent replacements: Obadiah uses an eagle; Luke uses the user-requested Bethlehem star; Romans uses a Roman helmet; Titus uses a shepherd’s staff with sunlight; Isaiah uses a new shoot growing from a stump. All other SVG files were verified byte-for-byte unchanged.

## App integration audit

All five existing book-art placements use `BookIcon`: BibleBrowserScreen, ChapterSelectorScreen, BibleReaderScreen, AudioFirstChapterCard, and CompanionCard. Each passes its displayed book ID; the browser also passes its availability-aware foreground color. No mobile source imports the old book PNG directory. Regression coverage checks these placements in addition to all 66 mappings and shared numbered-book drawings.

After the final five replacements, lint, typechecking, all 2,048 existing workspace tests, four focused vector/integration checks, and iOS/Android production exports passed. Live simulator verification was not completed because device-session conflicts prevented a reliable isolated run. These are local source changes, not a store release.
