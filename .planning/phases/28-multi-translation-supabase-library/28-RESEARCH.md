# Phase 28: Multi-Translation Supabase Library — Research

## RESEARCH COMPLETE

---

## 1. eBible.org Data Availability

**URL:** `https://ebible.org/Scriptures/translations.csv`
**Total translations:** 1,544
**Redistributable:** 1,285 (83%)
**Full Bible (OT=39 books, NT=27 books), redistributable AND downloadable:** **211 translations**

### Download URL Pattern
```
https://ebible.org/Scriptures/{translationId}_vpl.zip
```

Each zip contains three formats:
| File | Format | Parse complexity |
|------|--------|-----------------|
| `{id}_vpl.txt` | `GEN 1:1 verse text` one per line | Trivial regex |
| `{id}_vpl.xml` | `<v b="GEN" c="1" v="1">text</v>` | Very easy XML |
| `{id}_vpl.sql` | MySQL INSERT statements | Easy regex |

**Recommendation: Use `_vpl.xml`** — cleanest format, no USFM parser needed, already stripped of footnotes/cross-refs.

### Key CSV Columns
- `translationId` — download key
- `languageCode` — ISO 639-3
- `languageNameInEnglish`
- `Redistributable` — True/False gate
- `shortTitle` — display name
- `OTbooks`, `NTbooks` — coverage filter
- `textDirection` — ltr/rtl
- `Copyright` — license text
- `downloadable` — second gate (must be True)

### Priority Languages Matching App i18n
| Language | TranslationId | Title |
|----------|--------------|-------|
| English | engwebp | World English Bible |
| English | engwebu | World English Bible Updated |
| Spanish | spaRV1909 | Reina Valera 1909 |
| Spanish | spablm | Spanish Free Bible for the World |
| Hindi | hincv | Hindi Contemporary Version |
| Hindi | hin2017 | Hindi Indian Revised Version |
| Nepali | npiulb | Nepali Ulb Bible |

---

## 2. Existing Open-Source Tools Found

### A. praytify-app/open-bible-api ⭐ MOST RELEVANT
**URL:** https://github.com/praytify-app/open-bible-api
**Language:** TypeScript (Node.js 22)
**License:** MIT
**Updated:** March 2026

Complete pipeline: eBible.org download → USFM parse → Postgres (Drizzle ORM)

**Directly reusable components:**

| File | What it provides | Reuse |
|------|-----------------|-------|
| `src/seeder/sources/ebible.ts` | Downloads `{translationId}_usfm.zip`, caches locally | Adapt for `_vpl.zip` |
| `src/seeder/bulk-insert.ts` | Batched Postgres insert (500 rows/chunk), upsert-safe | Copy verbatim |
| `src/seeder/book-metadata.ts` | 66-book canonical metadata (3-letter codes, OT/NT, positions) | Copy verbatim |
| `src/db/schema.ts` | Drizzle schema: languages, versions, books, chapters, verses | Reference for our Supabase schema |

**Gap:** Uses USFM format, not VPL. Since VPL XML is far simpler, write a small XML parser instead of porting their USFM parser.

**Overall reuse: ~60-70% of seeder infrastructure**

---

### B. ringletech/webu-open-bible ⭐ SCHEMA REFERENCE
**URL:** https://github.com/ringletech/webu-open-bible
**Language:** SQL (data + schema)
**License:** Public Domain

Clean Postgres schema:
```sql
translation(id, code, name, publisher, year, copyright, license_type, language)
book(id, translation_id FK, name, slug, abbrev, testament, order_index, chapter_count)
verse(id, translation_id FK, book_id FK, chapter, verse_number, text, canonical_ref, order_index)
```

`sql/seed_webu.sql` — 31,098 INSERT statements, immediately runnable in Supabase.

**Reuse: Schema design (adapt for our needs), WEBU seed data directly usable**

---

### C. davidbaines/ebible_code — TRANSLATIONS.CSV PARSER
**URL:** https://github.com/davidbaines/ebible_code
**Language:** Python (pandas, requests)

- Reads translations.csv, merges with status tracking
- Bulk-downloads + unzips translations
- Filters by Redistributable

**Reuse: 40% — the catalog parsing/download logic (150 lines), adapt to TypeScript**

---

### D. scrollmapper/bible_databases — PRE-PROCESSED DATA
**URL:** https://github.com/scrollmapper/bible_databases
**Language:** SQL/JSON/CSV/SQLite data
**License:** MIT
**Stars:** significant

**140 translations** pre-processed in SQL/JSON/SQLite formats. Eliminates eBible processing for ~140 of our 211 targets.

**Import path:**
1. Clone repo or download individual translation SQL files
2. Run `psql -d $SUPABASE_DB -f {translation}.sql` or adapt to Supabase migration

**Reuse: Direct data import for ~140 translations — saves significant processing time**

---

### E. Other tools evaluated
- `getbible/v2` — Crosswire/SWORD source, not eBible.org. Different data.
- `BibleNLP/ebible` — ML corpus builder (Python, SIL Machine), over-engineered for our needs
- `bible-converter` (npm) — No public source, unverifiable quality

---

## 3. Supabase Storage Analysis

**Estimate:** 211 translations × ~31,000 verses × ~200 bytes = **~1.3GB**

- Supabase free tier: 500MB database → **exceeds free tier**
- Supabase Pro ($25/mo): 8GB → **sufficient for all 211 translations**
- **Phase strategy:** Import priority languages first (matches app's 4 i18n + major world languages), expand to full 211 after upgrading to Pro

---

## 4. Existing App Infrastructure (bibleDatabase patterns)

From reading `scripts/build_bible_db.py` and `scripts/process-web.js`:

**Current bundled db schema:**
```sql
verses(id, translation_id, book_id, chapter, verse, text, heading)
-- index: (translation_id, book_id, chapter, verse)
-- fts: verses_fts USING fts5(text, content='verses')
```

**For per-translation downloaded db files:** Use same schema for compatibility with existing `bibleDatabase.ts` query layer.

**Key service file:** `src/services/bible/bibleDatabase.ts` — all queries use `WHERE translation_id = ?` pattern. Adapting to read from per-translation db = change connection path, same SQL.

---

## 5. Implementation Plan (validated)

### Phase 28 should produce:

**Wave 1 (parallel):**
- `supabase/migrations/YYYYMMDD_bible_translations_schema.sql` — catalog + verses tables, indexes, RLS
- `scripts/import-translations.ts` — idempotent import pipeline: reads translations.csv, downloads VPL zip, parses XML, bulk upserts to Supabase

**Wave 2:**
- Seed priority translations (4 i18n languages first)
- Verify data in Supabase Dashboard

**Wave 3:**
- App: extend `bibleStore.downloadTranslation` to fetch from Supabase and write per-translation SQLite
- App: update `bibleDatabase.ts` to support per-translation db files
- App: TranslationBrowserScreen cloud catalog section + download flow

**Wave 4:**
- TypeScript check, tests, lint

---

## 6. Key Technical Risks

| Risk | Mitigation |
|------|-----------|
| Supabase free tier storage limit | Import priority languages only; script is selective by ID |
| eBible VPL zip format variation | VPL XML is consistent; add fallback to `.txt` format |
| Per-translation SQLite file size | ~5-15MB per translation; warn users before download |
| Supabase RLS blocking app queries | Explicitly set `translation_catalog` to public read, `verses` to public read |
| scrollmapper translations using different book IDs | Validate against our BOOK_IDS list from fetch_asv.py |

---

## Validation Architecture

### Test Plan
1. `npm run verify:bible-db` — existing bundled db still passes
2. TypeScript: `npm run typecheck` — 0 errors
3. Lint: `npm run lint` — 0 warnings
4. Manual: select a cloud translation in TranslationBrowserScreen → download → read Genesis 1:1
5. Manual: offline mode → previously downloaded translation still readable
6. Supabase: query `SELECT COUNT(*) FROM bible_verses WHERE translation_id = 'engwebp'` → ~31,098

### Success Criteria
- [ ] `bible_translations` table populated with ≥10 priority translations
- [ ] `bible_verses` table populated with correct verse counts per translation
- [ ] App can list cloud translations from Supabase
- [ ] Download flow writes per-translation SQLite file to device
- [ ] Downloaded translation readable offline in BibleReaderScreen
- [ ] Bundled BSB/WEB/ASV unaffected (same verse counts, same reader behavior)
