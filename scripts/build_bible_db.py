#!/usr/bin/env python3
"""Build or verify the bundled multi-translation Bible SQLite database asset."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "assets" / "databases" / "bible-bsb-v2.db"
SCHEMA_VERSION = 5
SOURCE_DATA = [
    {
        "translation_id": "bsb",
        "translation_name": "Berean Standard Bible",
        "path": ROOT / "data" / "bsb_processed.json",
        "expected_verse_count": 31086,
    },
    {
        "translation_id": "web",
        "translation_name": "World English Bible British Edition",
        "path": ROOT / "data" / "web_processed.json",
        "expected_verse_count": 31098,
    },
    {
        "translation_id": "asv",
        "translation_name": "American Standard Version",
        "path": ROOT / "data" / "asv_processed.json",
        "expected_verse_count": 31086,
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Verify the existing database asset")
    return parser.parse_args()


def load_source_data(source_config: dict) -> dict:
    input_path = source_config["path"]
    with input_path.open("r", encoding="utf-8") as source_file:
        source = json.load(source_file)

    verse_count = len(source["verses"])
    expected_verse_count = source_config["expected_verse_count"]
    if verse_count != expected_verse_count:
        raise SystemExit(
            f"Expected {expected_verse_count} verses in {input_path}, found {verse_count}"
        )

    return source


def build_database() -> None:
    sources = [(config, load_source_data(config)) for config in SOURCE_DATA]
    total_verse_count = sum(len(source["verses"]) for _, source in sources)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = OUTPUT_PATH.with_suffix(".tmp.db")
    if temp_path.exists():
        temp_path.unlink()

    connection = sqlite3.connect(temp_path)

    try:
        connection.executescript(
            """
            PRAGMA journal_mode = DELETE;
            PRAGMA synchronous = OFF;

            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE verses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              translation_id TEXT NOT NULL,
              book_id TEXT NOT NULL,
              chapter INTEGER NOT NULL,
              verse INTEGER NOT NULL,
              text TEXT NOT NULL,
              heading TEXT,
              formatting TEXT,
              UNIQUE(translation_id, book_id, chapter, verse)
            );

            CREATE INDEX idx_verses_translation_book_chapter
              ON verses(translation_id, book_id, chapter, verse);
            CREATE VIRTUAL TABLE verses_fts USING fts5(
              text,
              content='verses',
              content_rowid='id',
              tokenize='unicode61'
            );
            """
        )

        connection.execute("BEGIN")
        for source_config, source in sources:
            connection.executemany(
                """
                INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading, formatting)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        source_config["translation_id"],
                        verse["b"],
                        verse["c"],
                        verse["v"],
                        verse["t"],
                        verse.get("h"),
                        (
                            json.dumps(verse.get("f"), ensure_ascii=False, separators=(",", ":"))
                            if verse.get("f")
                            else None
                        ),
                    )
                    for verse in source["verses"]
                ],
            )

        metadata_entries = [
            ("schema_version", str(SCHEMA_VERSION)),
            ("translation_ids", ",".join(config["translation_id"] for config, _ in sources)),
            ("verse_count_total", str(total_verse_count)),
        ]
        metadata_entries.extend(
            (
                f'translation_name_{source_config["translation_id"]}',
                source_config["translation_name"],
            )
            for source_config, _ in sources
        )
        metadata_entries.extend(
            (
                f'verse_count_{source_config["translation_id"]}',
                str(len(source["verses"])),
            )
            for source_config, source in sources
        )
        connection.executemany(
            "INSERT INTO metadata (key, value) VALUES (?, ?)",
            metadata_entries,
        )
        connection.commit()

        connection.execute("INSERT INTO verses_fts(verses_fts) VALUES ('rebuild')")
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        connection.commit()
        connection.execute("VACUUM")
        connection.commit()
    finally:
        connection.close()

    temp_path.replace(OUTPUT_PATH)
    print(f"Built {OUTPUT_PATH}")


def verify_database() -> None:
    if not OUTPUT_PATH.exists():
        raise SystemExit(f"Missing database asset at {OUTPUT_PATH}")

    connection = sqlite3.connect(OUTPUT_PATH)
    try:
        user_version = connection.execute("PRAGMA user_version").fetchone()[0]
        verse_count = connection.execute("SELECT COUNT(*) FROM verses").fetchone()[0]
        fts_count = connection.execute("SELECT COUNT(*) FROM verses_fts").fetchone()[0]
        bsb_hits = connection.execute(
            """
            SELECT COUNT(*)
            FROM verses_fts
            JOIN verses ON verses.id = verses_fts.rowid
            WHERE verses_fts MATCH 'beginning*' AND verses.translation_id = 'bsb'
            """
        ).fetchone()[0]
        web_hits = connection.execute(
            """
            SELECT COUNT(*)
            FROM verses_fts
            JOIN verses ON verses.id = verses_fts.rowid
            WHERE verses_fts MATCH 'beginning*' AND verses.translation_id = 'web'
            """
        ).fetchone()[0]
        asv_hits = connection.execute(
            """
            SELECT COUNT(*)
            FROM verses_fts
            JOIN verses ON verses.id = verses_fts.rowid
            WHERE verses_fts MATCH 'beginning*' AND verses.translation_id = 'asv'
            """
        ).fetchone()[0]
    finally:
        connection.close()

    expected_total_verse_count = sum(
        source_config["expected_verse_count"] for source_config in SOURCE_DATA
    )
    if user_version != SCHEMA_VERSION:
        raise SystemExit(
            f"Expected schema version {SCHEMA_VERSION}, found {user_version}"
        )
    if verse_count != expected_total_verse_count:
        raise SystemExit(
            f"Expected {expected_total_verse_count} verses, found {verse_count}"
        )
    if fts_count != expected_total_verse_count:
        raise SystemExit(
            f"Expected {expected_total_verse_count} FTS rows, found {fts_count}"
        )
    if bsb_hits < 1 or web_hits < 1 or asv_hits < 1:
        raise SystemExit("Expected at least one FTS match for 'beginning*' in all translations")

    print(
        f"Verified {OUTPUT_PATH}: schema={user_version}, verses={verse_count}, fts_rows={fts_count}"
    )


def main() -> None:
    args = parse_args()
    if args.verify:
        verify_database()
    else:
        build_database()


if __name__ == "__main__":
    main()
