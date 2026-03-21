# Plan 13-01 Summary

## Outcome

EveryBible no longer relies on `Bible.is` for its built-in BSB audio path. The app now resolves BSB chapter playback/download URLs directly from the public MP3 source exposed through the official BSB audio ecosystem, and the repo's licensing/docs now reflect the verified Berean public-domain text and CC0 audio status.

## Changes

- Added direct BSB audio coverage in `src/services/audio/audioRemote.test.ts` for:
  - Genesis 1
  - 1 Corinthians 13
  - Psalm 150
  - runtime availability without `Bible.is`
- Extended `src/types/bible.ts` with a dedicated direct BSB audio provider type.
- Updated `src/constants/translations.ts` so `bsb` now uses the direct public-source provider and corrected the BSB copyright text.
- Updated `src/services/audio/audioRemote.ts` to build deterministic Bob Souer BSB chapter MP3 URLs from public `openbible.com` files instead of falling back to Bible.is for `bsb`.
- Refreshed repo copy in `README.md`, `.env.example`, `legal/terms.html`, `CLAUDE.md`, and `store-assets/app-store-listing.md` so BSB is no longer described as Bible.is-backed.
- Added Phase 13 planning artifacts to capture the verified public-domain sources and the follow-up plan for replacing the older BSB text-refresh pipeline.

## Verification

- `node --test --import tsx src/services/audio/audioRemote.test.ts`
- `node --test --import tsx src/services/audio/audioRemote.test.ts src/services/audio/audioDownloadService.test.ts src/services/audio/audioAvailability.test.ts src/services/bible/presentation.test.ts src/stores/persistedStateSanitizers.test.ts`
- `npx eslint src/types/bible.ts src/constants/translations.ts src/services/audio/audioRemote.ts src/services/audio/audioRemote.test.ts`
- `npm run typecheck` currently fails because unrelated Phase 12.1 reader work in the existing worktree is missing `getReaderChromeAnimationProgress`, `isReaderChromeCollapsed`, and `READER_BOTTOM_CHROME_COLLAPSE_DISTANCE` exports expected by `src/screens/bible/bibleReaderModel.test.ts`
- `npm test` currently fails for unrelated Phase 12.1 expectations in `src/screens/bible/bibleReaderChromeSource.test.ts` that look for premium read-mode chrome work not yet implemented in the current tree

## Remaining Manual Checks

- On device, stream BSB audio for at least one standard chapter, one Psalms chapter, and one numbered NT book.
- Download BSB audio for at least one book, then disable network and confirm offline playback still works.
- Confirm installs with previously downloaded BSB audio still behave correctly because local files remain preferred over remote URLs.

## Next Plan

- **13-02:** replace `scripts/process-bsb.js`'s older local-source dependency with an official Berean download/import pipeline and regenerate bundled BSB text artifacts from first-party files.
