"""Behavioural tests for the text-pack exporter's Supabase verse fetch.

Run from the repo root:
    python3 -m unittest discover -s scripts -p 'test_export_translation_text_packs.py'
"""

import re
import sqlite3
import tempfile
import unittest
from pathlib import Path

import export_translation_text_packs as exporter
from export_translation_text_packs import build_sqlite_database, fetch_translation_verses

APP_INDEX_MODULE = (
    Path(__file__).resolve().parent.parent / "src" / "services" / "bible" / "textPackSearchIndex.ts"
)


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FakeBibleVersesRest:
    """Answers GET /bible_verses the way PostgREST does for the params the exporter sends."""

    def __init__(self, rows):
        self.rows = rows
        self.requests = []

    def get(self, url, *, params, headers, timeout):
        self.requests.append(dict(params))
        assert url.endswith("/bible_verses"), url
        translation_id = params["translation_id"].removeprefix("eq.")
        matching = [row for row in self.rows if row["translation_id"] == translation_id]
        if "id" in params:
            lower_bound = int(params["id"].removeprefix("gt."))
            matching = [row for row in matching if row["id"] > lower_bound]
        assert params.get("order") == "id.asc", params
        matching.sort(key=lambda row: row["id"])
        offset = int(params.get("offset", "0"))
        limit = int(params["limit"])
        return FakeResponse(matching[offset : offset + limit])


def verse(row_id, translation_id, verse_number):
    return {
        "id": row_id,
        "translation_id": translation_id,
        "book_id": "GEN",
        "chapter": 1,
        "verse": verse_number,
        "text": f"{translation_id} {verse_number}",
        "heading": None,
        "formatting": None,
    }


ROWS = [
    verse(1, "other", 1),
    verse(2, "other", 2),
    verse(10, "demo", 1),
    verse(11, "demo", 2),
    verse(12, "demo", 3),
    verse(13, "demo", 4),
    verse(14, "demo", 5),
    verse(20, "other", 3),
]


def fetch(rest, page_size):
    return fetch_translation_verses(
        rest,
        "https://example.supabase.co/rest/v1",
        {"apikey": "test"},
        "demo",
        page_size=page_size,
    )


class FetchTranslationVersesTest(unittest.TestCase):
    def test_returns_every_verse_of_the_translation_in_id_order(self):
        rest = FakeBibleVersesRest(ROWS)

        rows = fetch(rest, page_size=2)

        self.assertEqual([row["id"] for row in rows], [10, 11, 12, 13, 14])

    def test_pages_by_id_cursor_instead_of_offset(self):
        # OFFSET paging makes Postgres re-read and sort every earlier row for each page;
        # on bible_verses that spilled 10.8 GB of temp files (supabase-disk-io-2026-09-15).
        rest = FakeBibleVersesRest(ROWS)

        fetch(rest, page_size=2)

        self.assertEqual(
            [(request.get("id"), request.get("offset")) for request in rest.requests],
            [(None, None), ("gt.11", None), ("gt.13", None)],
        )

    def test_stops_after_a_short_page_without_an_extra_request(self):
        rest = FakeBibleVersesRest(ROWS)

        rows = fetch(rest, page_size=3)

        self.assertEqual(len(rows), 5)
        self.assertEqual(len(rest.requests), 2)

    def test_keeps_requesting_full_rows_including_formatting(self):
        rest = FakeBibleVersesRest(ROWS)

        fetch(rest, page_size=10)

        self.assertEqual(rest.requests[0]["select"], "*")


PACK_ROWS = [
    {**verse(1, "demo", 1), "text": "In the beginning God created the heavens and the earth."},
    {**verse(2, "demo", 2), "text": "The LORD is my shepherd; I shall not want."},
    {**verse(3, "demo", 3), "text": "For God so loved the world."},
]


def table_names(path):
    connection = sqlite3.connect(path)
    try:
        return {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
    finally:
        connection.close()


class BuildSqliteDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "demo.db"

    def tearDown(self):
        self.directory.cleanup()

    def test_packs_ship_without_a_search_index_by_default(self):
        build_sqlite_database(self.path, PACK_ROWS)

        tables = table_names(self.path)
        self.assertIn("verses", tables)
        self.assertNotIn("verses_fts", tables)
        self.assertNotIn("search_index_state", tables)

    def test_a_pack_can_ship_a_complete_search_index_marked_with_its_version(self):
        build_sqlite_database(
            self.path,
            PACK_ROWS,
            search_index_version="2026.09.24-v4",
            generated_at="2026-09-24T00:00:00Z",
        )

        connection = sqlite3.connect(self.path)
        try:
            matches = [
                row[0]
                for row in connection.execute(
                    "SELECT rowid FROM verses_fts WHERE verses_fts MATCH ? ORDER BY rowid",
                    ('"lord"',),
                )
            ]
            love = [
                row[0]
                for row in connection.execute(
                    "SELECT rowid FROM verses_fts WHERE verses_fts MATCH ?", ('"love"*',)
                )
            ]
            state = connection.execute(
                "SELECT index_schema_version, pack_version, last_indexed_id, indexed_count,"
                " completed_at FROM search_index_state"
            ).fetchall()
        finally:
            connection.close()

        self.assertEqual(matches, [2])
        self.assertEqual(love, [3])
        self.assertEqual(state, [(1, "2026.09.24-v4", 3, 3, "2026-09-24T00:00:00Z")])

    def test_the_shipped_index_matches_the_one_the_app_builds(self):
        # A pack index with another definition or schema version would be rebuilt on every
        # device, or worse, queried with a tokenizer the app does not expect.
        source = APP_INDEX_MODULE.read_text(encoding="utf-8")
        app_version = int(
            re.search(r"PACK_SEARCH_INDEX_SCHEMA_VERSION = (\d+);", source).group(1)
        )
        app_fts_sql = re.search(r'CREATE_VERSES_FTS_SQL =\s*"([^"]+)"', source).group(1)

        self.assertEqual(exporter.PACK_SEARCH_INDEX_SCHEMA_VERSION, app_version)
        self.assertEqual(exporter.CREATE_VERSES_FTS_SQL, app_fts_sql)


if __name__ == "__main__":
    unittest.main()
