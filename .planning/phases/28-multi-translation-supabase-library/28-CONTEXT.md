# Phase 28: Multi-Translation Supabase Library — Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Conversation context (user decisions captured inline)

<domain>
## Phase Boundary

Add a Supabase-backed Bible translation library so users can browse all 211 public-domain full-Bible translations and download any of them to their device for offline reading. The bundled BSB/WEB/ASV translations (already in the app) are unaffected — this adds a new "download more translations" layer on top.

**In scope:**
- Supabase Postgres schema for translation catalog + verse storage
- Migration files runnable via Supabase CLI (`supabase db push`)
- Import script that populates translations from scrollmapper/bible_databases + eBible.org VPL
- App-side: TranslationBrowserScreen shows cloud catalog, allows download, tracks install state
- Downloaded translations cached in a per-translation local SQLite file (not bundled db)
- Filtering in catalog: full OT+NT only, redistributable, downloadable

**Out of scope:**
- Translations with partial coverage (NT-only, etc.)
- Copyrighted translations requiring license agreements
- Audio for new translations
- Web/admin dashboard for managing translations

</domain>

<decisions>
## Implementation Decisions

### Data Source Strategy
- **Primary:** scrollmapper/bible_databases (MIT, ~140 translations pre-processed as SQL/JSON) — import these first
- **Supplement:** eBible.org VPL zip downloads for remaining ~70 translations not in scrollmapper
- **Filter:** OTbooks=39 AND NTbooks=27 AND Redistributable=True AND downloadable=True → 211 translations confirmed
- **CSV catalog:** `https://ebible.org/Scriptures/translations.csv` is the authoritative source of metadata

### Backend: Supabase
- Store translation catalog and verse text in existing Supabase project
- Use Supabase CLI for migrations (`supabase migration new`, `supabase db push`)
- Row Level Security: translations table is public-readable; no auth required to browse/download
- Use Supabase Storage buckets OR serve verses directly from Postgres (direct Postgres preferred — avoids storage complexity)

### Database Schema (decided in conversation)
Two key tables:
1. `bible_translations` — catalog (id, language_code, language_name, title, direction, script, copyright, ot_books, nt_books, etc.)
2. `bible_verses` — verse text (translation_id FK, book_id, chapter, verse, text)
Schema inspired by `ringletech/webu-open-bible` (schema.sql in that repo)

### Import Script Language
- TypeScript/Node.js (matches existing scripts/process-web.js pattern)
- VPL XML format (`_vpl.xml` inside the zip) — simpler than USFM, trivially parsed
- Bulk insert in batches of 500 rows (pattern from praytify-app/open-bible-api)
- Script lives in `scripts/import-ebible-translations.ts`

### Existing Tools to Leverage
- **praytify-app/open-bible-api** (MIT, March 2026) — reuse bulk-insert.ts and book-metadata.ts patterns
- **ringletech/webu-open-bible** — adapt schema.sql for Supabase migration
- **davidbaines/ebible_code** — adapt translations.csv parsing logic
- **Total custom code: ~200-300 lines** (per research)

### App-Side: Download Flow
- TranslationBrowserScreen already exists and shows local/cloud translations
- Add "cloud" section showing Supabase catalog (translations not yet downloaded)
- Tap → download → store verse rows in a per-translation SQLite file in device document directory
- Use existing `downloadTranslation` action in bibleStore (currently a stub for non-bundled translations)
- Progress indicator during download (verse count / total)

### Storage: Local SQLite per Translation
- Each downloaded translation → its own `{translationId}.db` SQLite file
- Same schema as bundled bible-bsb-v2.db (translation_id, book_id, chapter, verse, text)
- bibleDatabase service reads from either the bundled db or a per-translation file depending on currentTranslation
- This avoids growing the bundled db with every downloaded translation

### Supabase Plan Consideration
- User is on Supabase free plan; 211 full Bibles × ~31,000 verses = ~6.5M rows
- Free plan limit: 500MB database; 6.5M verse rows at ~200 bytes each ≈ ~1.3GB — exceeds free tier
- **Decision: Start with high-priority languages first** (English, Spanish, Hindi, Nepali = app's current i18n languages), then expand
- Use Supabase Pro ($25/mo) when ready to load all 211
- Import script should support `--limit-languages` or per-translation selective import

### Claude's Discretion
- Exact Supabase table column names and index strategy
- Whether to use a `chapters` table or store chapter-level data in verses table
- Error handling for failed downloads (retry logic, partial download cleanup)
- Exact UI treatment for download progress in TranslationBrowserScreen
- Whether to paginate the cloud catalog or load all at once (catalog rows are small)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Bible Infrastructure
- `src/services/bible/bibleDatabase.ts` — SQLite service, getChapter/searchVerses patterns to replicate for per-translation dbs
- `src/stores/bibleStore.ts` — downloadTranslation stub to implement, currentTranslation state
- `src/screens/more/TranslationBrowserScreen.tsx` — existing UI to extend with cloud catalog section
- `src/constants/translations.ts` — translation catalog constants; new translations come from Supabase instead
- `scripts/build_bible_db.py` — shows existing DB schema (translation_id, book_id, chapter, verse, text)
- `scripts/process-web.js` — shows VPL SQL parsing pattern to adapt for VPL XML

### Supabase Setup
- `supabase/migrations/` — existing migration pattern to follow
- `.env` / `.env.example` — Supabase URL and anon key env vars already configured

### External References
- eBible.org translations.csv: `https://ebible.org/Scriptures/translations.csv`
- VPL zip URL pattern: `https://ebible.org/Scriptures/{translationId}_vpl.zip` (contains `_vpl.xml`)
- scrollmapper/bible_databases: `https://github.com/scrollmapper/bible_databases` (MIT, 140 translations)
- praytify-app/open-bible-api: `https://github.com/praytify-app/open-bible-api` (MIT, bulk-insert + book-metadata patterns)
- ringletech/webu-open-bible schema: `https://github.com/ringletech/webu-open-bible` (Postgres schema reference)

</canonical_refs>

<specifics>
## Specific Ideas

- Priority languages to import first: English (engwebp, engwebu, engbsb already bundled), Spanish (spaRV1909, spablm), Hindi (hincv, hin2017), Nepali (npiulb) — matching the app's 4 i18n languages
- Translation Browser should show a badge or flag icon per language
- Downloaded translations should persist across app updates (stored in device document directory, not app bundle)
- The import script should be idempotent (safe to re-run; uses upsert not insert)
- eBible VPL XML format: `<v b="GEN" c="1" v="1">text</v>` — very simple, no USFM parser needed

</specifics>

<deferred>
## Deferred Ideas

- Loading all 211 translations (Supabase Pro required first)
- Admin UI for managing translation imports
- Audio for downloaded translations
- Translation search/filtering by script or region in the app
- Cross-translation verse comparison view
- Apocrypha/Deuterocanonical translations

</deferred>

---

*Phase: 28-multi-translation-supabase-library*
*Context gathered: 2026-03-24 via conversation (user decisions + research findings)*
