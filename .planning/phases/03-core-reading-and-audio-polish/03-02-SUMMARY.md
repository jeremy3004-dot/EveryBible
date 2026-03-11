# Plan 02 Summary

## Outcome

Audio surfaces now trust real capability instead of translation metadata alone. Home, Reader, and the Bible browser stop promising playback or downloads when Bible.is is unavailable, while still allowing already-downloaded chapter audio to remain usable offline.

## Changes

- Added `src/services/audio/audioAvailability.ts` plus `src/services/audio/audioAvailability.test.ts` as a pure capability model for remote streaming, offline playback, and download availability.
- Updated `src/screens/home/HomeScreen.tsx` so daily scripture generation stays conservative about remote audio while the rendered CTA can still appear for the specific daily reference when that book is already saved offline.
- Updated `src/screens/bible/BibleReaderScreen.tsx` to gate chapter audio by real per-book capability instead of only checking whether the translation claims to have audio.
- Updated `src/screens/bible/BibleBrowserScreen.tsx` and `src/services/audio/index.ts` so audio management only appears when remote or offline audio actually exists, and download buttons disable when remote audio is not available.

## Verification

- `node --test --import tsx src/services/audio/audioAvailability.test.ts src/services/audio/audioSource.test.ts src/services/audio/audioDownloadService.test.ts src/services/audio/audioDownloads.test.ts src/services/bible/dailyScripture.test.ts`
- `npx eslint src/services/audio/audioAvailability.ts src/services/audio/audioAvailability.test.ts src/screens/bible/BibleBrowserScreen.tsx src/screens/bible/BibleReaderScreen.tsx src/screens/home/HomeScreen.tsx src/services/audio/audioService.ts`
- `npm test`

## Remaining Manual Checks

- On a release-like build with Bible.is configured, verify Home and Reader can stream audio and the browser can download audio by book and by translation.
- On a build without Bible.is configuration, confirm Home and Reader stop offering unsupported streaming while previously downloaded book audio still plays offline.
- Download a single book, relaunch offline, and confirm the Bible browser still shows the saved state without exposing disabled remote-download actions as available.
