# Search index for downloaded text packs: 2026-09-24

## Problem

Word search on a downloaded translation always showed "search unavailable". Text packs
(`scripts/export_translation_text_packs.py`) ship only the `verses` table. The bundled database
(`scripts/build_bible_db.py`) also has `verses_fts`, and `searchVerses` threw
`BibleSearchUnavailableError` whenever that table was missing. The CJK search fix from earlier
today (`instr()` substring match) covered Chinese, Japanese, Korean, Thai, Lao, Khmer and Myanmar
queries only.

## Fix

The index is built on the device, so the packs already on R2 do not need to be published again.

- **Where the index lives.** The index goes inside the pack file, with the bundled database's
  definition:
  `fts5(text, content='verses', content_rowid='id', tokenize='unicode61')`. The existing FTS
  query and its bm25 ranking work unchanged. The query side keeps combining marks and
  apostrophes inside a word (`buildBibleSearchQuery`, from the reader bug hunt), which relies
  on `unicode61`, the same as the bundled index. Because the index is part of the file, deleting
  or replacing the pack deletes its index. Nothing else has to be cleaned up.
  Index schema version 2 changed the pack tokenizer to `unicode61 remove_diacritics 2`, which
  also folds letters carrying two marks (Vietnamese ờ, ư, ơ, ệ), so "troi" finds "Trời". Packs
  indexed at version 1 are rebuilt on their next search. The bundled database was rebuilt with
  the same tokenizer on 2026-09-25 (schema 8), adding `prefix='1 2 3'`; its term list did not
  change, so no bundled search result changed.
- **Build marker.** The `search_index_state` table (one row) records `index_schema_version`,
  `pack_version` (the catalog text version, from `activeTextPackVersion`), `last_indexed_id`,
  `indexed_count` and `completed_at`. The status is one of:
  - `missing`: no `verses_fts` table.
  - `partial`: the marker exists but has no `completed_at`. The build resumes from
    `last_indexed_id`.
  - `stale`: another schema version or pack version. The index is dropped and rebuilt.
  - `ready`: the build completed. A `verses_fts` table without a marker is also treated as
    ready. The bundled database ships that way, built in one `'rebuild'` step.
- **Building** (`src/services/bible/textPackSearchIndex.ts`):
  - The build uses its own connection (`useNewConnection: true`) in WAL mode. The reader's
    shared handle keeps serving chapters, and closing that handle never lands inside a build
    transaction. On iOS, expo-sqlite runs async calls on a concurrent queue
    (`SQLiteModule.swift`), so the two connections do not wait on each other. The Android
    dispatcher was not checked.
  - The build inserts 1,000 verses per transaction with
    `INSERT INTO verses_fts(rowid, text) SELECT id, text FROM verses WHERE id > ? AND id <= ?`.
    The resume point commits in the same transaction. No verse text passes through JS.
  - It pauses 16 ms between chunks and checks for cancellation before each chunk.
  - It runs once per pack at a time. A failed build is not retried for 10 minutes.
- **When it runs.**
  - Right after a pack install succeeds (`bibleStore.downloadTranslation`).
  - Lazily, on the first word search of a pack without a ready index. This covers packs already
    installed on existing devices and interrupted builds.
- **Fallback.** While the index is missing or building, or after a build failed, a word search
  on a pack runs an `instr()` substring scan instead of reporting "unavailable". The scan uses
  the same helper as the CJK search:
  - Every word must appear. Each word matches as typed, lowercase, capitalised or uppercase,
    because `instr()` is case-sensitive and SQLite's `lower()` only folds ASCII.
  - Results come in canonical book order, capped at the search limit. A query uses at most
    8 words.
  - Known gaps: a lowercase query does not find a capitalised accented word ("élie" does not
    find "Élie"), and diacritics are not folded. The FTS index handles both once it is built.
    No new UI string was needed.
- **Failure (disk full).** A chunk that hits `SQLITE_FULL` rolls back as a whole. The builder
  then drops the partial index to give the space back and returns `failed`. Search keeps using
  the fallback. The next build, after 10 minutes or after the pack is invalidated, starts over.
- **Deletion and replacement.**
  - `invalidateInstalledBibleDatabaseAtPath` now cancels the pack's build first and waits for
    its connection to close. It also clears the cached "index ready" answer. Every delete path
    goes through it. The store now also invalidates the old pack before deleting it after an
    update, and invalidates a new pack that fails its read-back before deleting it.
  - A pack update installs to a new file, which starts without an index. The version in the
    marker also triggers a rebuild if a file is ever reused.

## Measurements

These are pack-shaped copies of the bundled BSB and Nepali (npiulb) text, using the exporter
schema without an index. They ran through the real module on a node:sqlite adapter on an
M-series Mac. No real downloaded pack was available locally.

| Pack        | Verses | Size before | Size after | Transactions | SQLite work | Wall (with pauses) | Median / slowest chunk |
| ----------- | -----: | ----------: | ---------: | -----------: | ----------: | -----------------: | ---------------------: |
| BSB (en)    | 31,086 |     7.62 MB |   10.97 MB |           34 |      388 ms |             1.15 s |            5.7 / 86 ms |
| npiulb (ne) | 31,102 |    13.48 MB |   17.88 MB |           34 |      721 ms |             1.71 s |          11.9 / 124 ms |

The index adds about 33-44% to the pack on disk. The slow chunks are FTS5 segment merges. On a
phone, allow 5-10x these numbers: a few seconds in the background. The JS thread only awaits.

A fallback scan took 3 ms on BSB for a Latin query with 3 spellings. A full scan of the Nepali
pack with no match took 28-57 ms. Both were on a desktop. An FTS query on the built index took under 1 ms (BSB) and 8 ms (Nepali).

## Shipping the index in future packs

`scripts/export_translation_text_packs.py --with-search-index` builds the same `verses_fts`
inside each pack with a one-step `'rebuild'`. It also writes a complete `search_index_state`
row with `pack_version` set to the pack's version tag, and records `hasSearchIndex` in the
manifest. The app sees that pack as ready and never builds anything. The flag is off by
default. The export was not run against production for this change.
`scripts/test_export_translation_text_packs.py` checks that the exporter's schema version and
FTS definition match the app's.

Run the tests with
`python3 -m unittest discover -s scripts -p 'test_export_translation_text_packs.py'`.

## Not done / follow-ups

- **Device QA.**
  - Install a pack, search a Latin word right away (expect the fallback results), then search
    again a few seconds later (expect FTS ranking).
  - Delete the pack mid-build.
  - Try a nearly full device.
- **Android concurrency.** Not verified: whether expo-sqlite's Android async dispatcher runs two
  connections in parallel. If it serializes them, chapter reads can wait up to one chunk
  (about 0.1-1 s on a slow phone) during a build. Lowering `PACK_SEARCH_INDEX_CHUNK_SIZE` is
  the lever.
- **Legacy `insertVerse(s)`.** These write only `verses`. An external-content index would then
  miss those rows. Nothing calls them on packs today.
