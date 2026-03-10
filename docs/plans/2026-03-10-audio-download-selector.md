## Audio Download Selector Design

### Goal

When a user taps the Bible translation selector, they should be able to manage offline audio for that translation:

- download the whole Bible audio at once
- download individual books
- see a clear checkmark for completed downloads

This should be a real offline download flow, not a visual-only placeholder.

### Constraints

- Keep text translation downloads and audio downloads separate.
- Do not break the current translation selection flow.
- Prefer a small, explicit store shape over clever derived state.
- Reuse the existing Bible.is audio source and the existing book catalog.

### Approach

Add a small audio-download domain around the existing translation metadata.

- `BibleTranslation` gains separate audio download fields:
  - `isAudioDownloaded`
  - `downloadedAudioBooks`
- Add a pure helper module for audio download planning/status:
  - build the chapter plan for a single book or the whole Bible
  - compute whether a book or an entire translation is fully downloaded
- Add an `audioDownloadService` that saves chapter audio files under the app document directory by translation/book/chapter.
- Update `audioService` so playback checks the local file path first, then falls back to streaming.
- Extend the translation modal so audio-capable translations expose a `Manage audio` action that opens a second modal.

### UX

The translation modal remains the main place for switching translations.

- Selecting a downloaded text translation still switches normally.
- For audio-capable translations, the row also offers audio management.
- The audio modal includes:
  - one CTA to download the whole Bible audio
  - a list of books with checkmarks for downloaded books
  - a checkmark on the whole-Bible CTA when all books are downloaded

For translations with no audio support, the audio controls are not shown.

### Data Flow

1. User opens translation selector.
2. User taps `Manage audio`.
3. UI calls store actions backed by `audioDownloadService`.
4. Service resolves chapter URLs from Bible.is and downloads files locally.
5. Store marks completed books and whole-translation completion.
6. Audio playback uses the local file when present.

### Testing

Write tests first for:

- audio download planning/status helpers
- persisted Bible state sanitization for the new audio fields
- local-audio-first resolution in the audio service

This keeps the feature deterministic while the UI stays thin.
