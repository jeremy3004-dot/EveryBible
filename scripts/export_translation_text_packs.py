#!/usr/bin/env python3
"""Export current Supabase translations into R2-ready SQLite text packs.

This script reads the live translation control plane from Supabase, fetches the
current verse rows through PostgREST, writes one SQLite database per current
translation, computes SHA-256 checksums, and emits:

- `tmp/r2-source-of-truth/text/...` sqlite packs ready for upload to R2
- `tmp/r2-source-of-truth/text-pack-manifest.json` with pack metadata
- `tmp/r2-source-of-truth/catalog-updates.sql` with deterministic catalog updates

The mobile app already knows how to install catalog-backed SQLite text packs.
This script makes the publishing side produce those packs for every current
translation so the app no longer needs row-by-row Supabase text downloads.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / "tmp" / "r2-source-of-truth"
TEXT_OUTPUT_ROOT = OUTPUT_ROOT / "text"
MANIFEST_PATH = OUTPUT_ROOT / "text-pack-manifest.json"
SQL_OUTPUT_PATH = OUTPUT_ROOT / "catalog-updates.sql"
SCHEMA_VERSION = 3
PAGE_SIZE = 1000


MANUAL_CATALOG_OVERRIDES: dict[str, dict[str, Any]] = {
    "engbsb": {
        "audio": {
            "strategy": "stream-template",
            "baseUrl": "audio/bsb",
            "chapterPathTemplate": "{bookId}/{chapter}.m4a",
            "fileExtension": "m4a",
            "mimeType": "audio/mp4",
        }
    },
    "engwebp": {
        "audio": {
            "strategy": "stream-template",
            "baseUrl": "audio/web",
            "chapterPathTemplate": "{bookId}/{chapter}.mp3",
            "fileExtension": "mp3",
            "mimeType": "audio/mpeg",
        },
        "timing": {
            "strategy": "stream-template",
            "baseUrl": "timing/web",
            "chapterPathTemplate": "{bookId}_{chapterPadded}.json",
            "fileExtension": "json",
            "mimeType": "application/json",
        },
    },
}


@dataclass(frozen=True)
class TranslationVersionRow:
    translation_id: str
    version_number: int
    total_verses: int
    published_at: str | None


@dataclass(frozen=True)
class TranslationCatalogRow:
    translation_id: str
    name: str
    abbreviation: str
    language_name: str
    has_audio: bool
    has_text: bool
    is_available: bool
    catalog: dict[str, Any] | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        default=str(OUTPUT_ROOT),
        help="Root directory for generated packs and manifests.",
    )
    parser.add_argument(
        "--translation",
        action="append",
        default=[],
        help="Limit export to one or more backend translation_ids.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=PAGE_SIZE,
        help="Supabase fetch page size for bible_verses.",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def build_auth_headers(api_key: str) -> dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }


def get_rest_base_url(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/rest/v1"


def get_json(
    session: requests.Session,
    url: str,
    *,
    params: dict[str, str],
    headers: dict[str, str],
    timeout: int = 60,
) -> Any:
    response = session.get(url, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.json()


def fetch_current_versions(
    session: requests.Session, rest_base_url: str, headers: dict[str, str]
) -> list[TranslationVersionRow]:
    payload = get_json(
        session,
        f"{rest_base_url}/translation_versions",
        params={
            "select": "translation_id,version_number,total_verses,published_at",
            "is_current": "eq.true",
            "order": "translation_id.asc",
        },
        headers=headers,
    )

    return [
        TranslationVersionRow(
            translation_id=str(item["translation_id"]),
            version_number=int(item["version_number"] or 1),
            total_verses=int(item["total_verses"] or 0),
            published_at=item.get("published_at"),
        )
        for item in payload
    ]


def fetch_available_catalog_rows(
    session: requests.Session, rest_base_url: str, headers: dict[str, str]
) -> list[TranslationCatalogRow]:
    payload = get_json(
        session,
        f"{rest_base_url}/translation_catalog",
        params={
            "select": "translation_id,name,abbreviation,language_name,has_audio,has_text,is_available,catalog",
            "is_available": "eq.true",
            "order": "sort_order.asc.nullslast,translation_id.asc",
        },
        headers=headers,
    )

    return [
        TranslationCatalogRow(
            translation_id=str(item["translation_id"]),
            name=str(item["name"]),
            abbreviation=str(item["abbreviation"]),
            language_name=str(item["language_name"]),
            has_audio=bool(item.get("has_audio")),
            has_text=bool(item.get("has_text")),
            is_available=bool(item.get("is_available")),
            catalog=item.get("catalog") if isinstance(item.get("catalog"), dict) else None,
        )
        for item in payload
    ]


def fetch_translation_verses(
    session: requests.Session,
    rest_base_url: str,
    headers: dict[str, str],
    translation_id: str,
    *,
    page_size: int,
) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        payload = get_json(
            session,
            f"{rest_base_url}/bible_verses",
            params={
                "select": "translation_id,book_id,chapter,verse,text,heading",
                "translation_id": f"eq.{translation_id}",
                "order": "id.asc",
                "limit": str(page_size),
                "offset": str(offset),
            },
            headers=headers,
            timeout=120,
        )

        page = payload if isinstance(payload, list) else []
        if not page:
            break

        all_rows.extend(page)
        offset += len(page)

        if len(page) < page_size:
            break

    return all_rows


def build_version_tag(version_row: TranslationVersionRow) -> str:
    if version_row.published_at:
        try:
            published = datetime.fromisoformat(
                version_row.published_at.replace("Z", "+00:00")
            ).astimezone(UTC)
            return f"{published.strftime('%Y.%m.%d')}-v{version_row.version_number}"
        except ValueError:
            pass

    return f"v{version_row.version_number}"


def compute_sha256(target_path: Path) -> str:
    digest = hashlib.sha256()
    with target_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_sqlite_database(target_path: Path, verses: list[dict[str, Any]]) -> None:
    temp_path = target_path.with_suffix(".tmp")
    if temp_path.exists():
        temp_path.unlink()

    target_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(temp_path)

    try:
        connection.executescript(
            """
            PRAGMA journal_mode = DELETE;
            PRAGMA synchronous = OFF;

            CREATE TABLE verses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              translation_id TEXT NOT NULL,
              book_id TEXT NOT NULL,
              chapter INTEGER NOT NULL,
              verse INTEGER NOT NULL,
              text TEXT NOT NULL,
              heading TEXT
            );

            CREATE UNIQUE INDEX idx_verses_unique
              ON verses(translation_id, book_id, chapter, verse);
            CREATE INDEX idx_verses_lookup
              ON verses(translation_id, book_id, chapter);
            """
        )

        connection.execute("BEGIN")
        connection.executemany(
            """
            INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    row["translation_id"],
                    row["book_id"],
                    int(row["chapter"]),
                    int(row["verse"]),
                    row["text"],
                    row.get("heading"),
                )
                for row in verses
            ],
        )
        connection.commit()
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        connection.commit()
        connection.execute("VACUUM")
        connection.commit()
    finally:
        connection.close()

    shutil.move(temp_path, target_path)


def merge_catalog(
    *,
    existing_catalog: dict[str, Any] | None,
    translation_id: str,
    generated_at: str,
    text_version: str,
    text_download_url: str,
    text_sha256: str,
) -> dict[str, Any]:
    next_catalog: dict[str, Any] = {
        "version": text_version,
        "updatedAt": generated_at,
        "text": {
            "format": "sqlite",
            "version": text_version,
            "downloadUrl": text_download_url,
            "sha256": text_sha256,
        },
    }

    if existing_catalog and isinstance(existing_catalog.get("minimumAppVersion"), str):
        next_catalog["minimumAppVersion"] = existing_catalog["minimumAppVersion"]

    if existing_catalog and isinstance(existing_catalog.get("audio"), dict):
        next_catalog["audio"] = existing_catalog["audio"]

    if existing_catalog and isinstance(existing_catalog.get("timing"), dict):
        next_catalog["timing"] = existing_catalog["timing"]

    manual_override = MANUAL_CATALOG_OVERRIDES.get(translation_id)
    if manual_override:
        next_catalog.update(manual_override)

    return next_catalog


def build_catalog_update_sql(manifest_rows: list[dict[str, Any]]) -> str:
    lines = [
        "-- Generated by scripts/export_translation_text_packs.py",
        "-- Updates current translation catalogs so all text packs resolve from R2.",
        "",
        "begin;",
        "",
    ]

    for row in manifest_rows:
        catalog_json = json.dumps(row["catalog"], ensure_ascii=False, separators=(",", ":")).replace(
            "'", "''"
        )
        has_audio = "true" if "audio" in row["catalog"] else "false"
        escaped_translation_id = row["translationId"].replace("'", "''")

        lines.append(
            "\n".join(
                [
                    "update translation_catalog",
                    f"set catalog = '{catalog_json}'::jsonb,",
                    "    has_text = true,",
                    f"    has_audio = {has_audio},",
                    "    is_available = true,",
                    "    updated_at = timezone('utc', now())",
                    f"where translation_id = '{escaped_translation_id}';",
                    "",
                ]
            )
        )

    lines.append("commit;")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    output_root = Path(args.output_root).resolve()
    text_root = output_root / "text"
    manifest_path = output_root / "text-pack-manifest.json"
    sql_output_path = output_root / "catalog-updates.sql"

    supabase_url = require_env("EXPO_PUBLIC_SUPABASE_URL")
    supabase_anon_key = require_env("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    rest_base_url = get_rest_base_url(supabase_url)
    auth_headers = build_auth_headers(supabase_anon_key)
    selected_ids = {item.strip() for item in args.translation if item.strip()}

    output_root.mkdir(parents=True, exist_ok=True)
    text_root.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    current_versions = fetch_current_versions(session, rest_base_url, auth_headers)
    versions_by_id = {row.translation_id: row for row in current_versions}
    catalog_rows = fetch_available_catalog_rows(session, rest_base_url, auth_headers)

    manifest_rows: list[dict[str, Any]] = []
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    for catalog_row in catalog_rows:
        if catalog_row.translation_id not in versions_by_id:
            continue

        if selected_ids and catalog_row.translation_id not in selected_ids:
            continue

        version_row = versions_by_id[catalog_row.translation_id]
        verses = fetch_translation_verses(
            session,
            rest_base_url,
            auth_headers,
            catalog_row.translation_id,
            page_size=min(1000, max(1, args.page_size)),
        )

        if not verses:
            raise SystemExit(
                f"Expected verses for {catalog_row.translation_id}, but no rows were returned."
            )

        expected_verse_count = max(0, version_row.total_verses)
        if expected_verse_count and len(verses) != expected_verse_count:
            raise SystemExit(
                f"{catalog_row.translation_id}: expected {expected_verse_count} verses, got {len(verses)}"
            )

        asset_id = catalog_row.translation_id.lower()
        version_tag = build_version_tag(version_row)
        filename = f"{asset_id}-{version_tag}.db"
        local_path = text_root / asset_id / filename
        download_url = f"text/{asset_id}/{filename}"

        build_sqlite_database(local_path, verses)
        sha256 = compute_sha256(local_path)

        catalog = merge_catalog(
            existing_catalog=catalog_row.catalog,
            translation_id=catalog_row.translation_id,
            generated_at=generated_at,
            text_version=version_tag,
            text_download_url=download_url,
            text_sha256=sha256,
        )

        manifest_rows.append(
            {
                "translationId": catalog_row.translation_id,
                "name": catalog_row.name,
                "abbreviation": catalog_row.abbreviation,
                "language": catalog_row.language_name,
                "versionNumber": version_row.version_number,
                "version": version_tag,
                "totalVerses": len(verses),
                "downloadUrl": download_url,
                "localPath": str(local_path),
                "sha256": sha256,
                "sizeBytes": local_path.stat().st_size,
                "catalog": catalog,
            }
        )

        print(
            f"Exported {catalog_row.translation_id} -> {local_path} "
            f"({len(verses)} verses, sha256={sha256[:12]}...)"
        )

    manifest_rows.sort(key=lambda item: item["translationId"])
    manifest_payload = {
        "generatedAt": generated_at,
        "translations": manifest_rows,
    }
    manifest_path.write_text(
        json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sql_output_path.write_text(build_catalog_update_sql(manifest_rows), encoding="utf-8")

    print(
        json.dumps(
            {
                "generatedAt": generated_at,
                "translationCount": len(manifest_rows),
                "manifestPath": str(manifest_path),
                "sqlPath": str(sql_output_path),
                "textRoot": str(text_root),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
