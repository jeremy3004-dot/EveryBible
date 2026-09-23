"""Behavioural tests for the text-pack exporter's Supabase verse fetch.

Run from the repo root:
    python3 -m unittest discover -s scripts -p 'test_export_translation_text_packs.py'
"""

import unittest

from export_translation_text_packs import fetch_translation_verses


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


if __name__ == "__main__":
    unittest.main()
