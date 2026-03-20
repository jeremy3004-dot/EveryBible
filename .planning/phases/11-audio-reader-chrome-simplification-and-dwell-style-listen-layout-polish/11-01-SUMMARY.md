# Plan 11-01 Summary

## Outcome

The audio-first Bible screen now uses minimal top chrome, so it only shows the back button, `Listen / Read` rail, and overflow actions while the duplicated chapter title, translation chip, `AA` button, and explanatory audio-only copy are gone.

## Changes

- Updated `src/screens/bible/BibleReaderScreen.tsx` to compute `showMinimalListenChrome` and hide the extra top title/version/`AA` header controls whenever the chapter session is in the dedicated listen surface.
- Simplified the listen-mode body in `src/screens/bible/BibleReaderScreen.tsx` so it no longer renders the extra translation eyebrow or redundant play CTA above the transport.
- Added/updated source-level regression coverage in `src/screens/bible/bibleReaderChromeSource.test.ts` to lock the minimal listen chrome behavior in place.

## Verification

- `node --test --import tsx src/screens/bible/bibleReaderChromeSource.test.ts src/components/audio/audioFirstChapterCardSource.test.ts`
- `npm run lint -- src/screens/bible/BibleReaderScreen.tsx src/components/audio/AudioFirstChapterCard.tsx src/screens/bible/bibleReaderChromeSource.test.ts src/components/audio/audioFirstChapterCardSource.test.ts`
- `npm run typecheck`

## Remaining Manual Checks

- Confirm the simplified header still feels balanced on smaller iPhones when the safe-area inset grows.
- Confirm the overflow affordance remains obvious enough now that the top row is intentionally sparse.
