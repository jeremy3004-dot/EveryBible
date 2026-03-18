# Plan 01 Summary

## Outcome

EveryBible now accepts common typed scripture references directly from the live Bible search field and can open the intended passage without forcing those inputs through full-text search.

## Changes

- Added `bible-passage-reference-parser` and a new `src/services/bible/referenceParser.ts` adapter that maps parser OSIS output into the app's existing `BibleReader` route contract.
- Expanded `src/screens/bible/bibleSearchModel.ts` and `src/screens/bible/bibleSearchModel.test.ts` so the screen can distinguish idle queries, parsed references, and full-text search intent.
- Updated `src/screens/bible/BibleBrowserScreen.tsx` so parsed references show a direct-open card and submit-to-open behavior while plain-text search still uses local SQLite search.

## Verification

- `node --test --import tsx src/screens/bible/bibleSearchModel.test.ts src/services/bible/referenceParser.test.ts`
- `npm test`
- `npm run release:verify`

## Remaining Manual Checks

- Type `John 3:16`, `1 Cor 13`, and `Luke 10:5-7, 10-11` in the Bible surface and confirm the direct-open card and final reader destination match expectations on device.
