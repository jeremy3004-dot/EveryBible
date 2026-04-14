#!/usr/bin/env python3
"""Publish local WebM Bible audio as app-ready chapter MP3 assets in R2.

This script is intended for operator-only corpora like the Bhujel files on
Desktop. It:

1. Reads mixed unpacked `.webm` files and zipped `.webm` files.
2. Groups them into canonical `(book, chapter)` units.
3. Concatenates split chapters in verse order and transcodes each chapter to MP3.
4. Writes a versioned manifest plus a translation_catalog-compatible catalog JSON.
5. Uploads chapter assets + manifest to Cloudflare R2.
6. Optionally updates the live `translation_catalog` row once verification passes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
BOOKS_TS_PATH = ROOT / "src" / "constants" / "books.ts"
DEFAULT_SOURCE_DIR = Path("/Users/dev/Desktop/Rasuwa and Bhujel/Bhujel")
DEFAULT_STAGE_ROOT = ROOT / "tmp" / "local-chapter-audio-r2"
DEFAULT_MANIFEST_PREFIX = "manifests/audio"
DEFAULT_VERSION = f"{datetime.now().strftime('%Y.%m.%d')}-local-webm-chapter-audio-v1"

IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
MANIFEST_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=60"

BOOK_ENTRY_PATTERN = re.compile(
    r"\{[^{}]*id:\s*'(?P<id>[^']+)'[^{}]*name:\s*'(?P<name>[^']+)'[^{}]*chapters:\s*(?P<chapters>\d+)[^{}]*order:\s*(?P<order>\d+)[^{}]*\}",
    re.MULTILINE,
)
MEDIA_FILE_PATTERN = re.compile(
    r"^(?P<language>.+?)_(?P<book>.+?)_Chapter(?P<chapter>\d{3})_V(?P<start>\d{3})_(?P<end>\d{3})\.webm$"
)


@dataclass(frozen=True)
class DatasetSpec:
    translation_id: str
    translation_name: str
    abbreviation: str
    language_code: str
    language_name: str
    language_label: str
    sort_order: int
    source_url: str
    text_direction: str
    source_dir: Path


@dataclass(frozen=True)
class BookMeta:
    id: str
    name: str
    chapters: int
    order: int


@dataclass(frozen=True)
class SourceClip:
    book_id: str
    book_name: str
    chapter: int
    verse_start: int
    verse_end: int
    filename: str
    source_type: str
    source_path: str
    zip_member: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--translation-id", default="byh")
    parser.add_argument("--translation-name", default="Bhujel")
    parser.add_argument("--abbreviation", default="BHU")
    parser.add_argument("--language-code", default="byh")
    parser.add_argument("--language-name", default="Bhujel")
    parser.add_argument("--language-label", default="Bhujel")
    parser.add_argument("--sort-order", type=int, default=428)
    parser.add_argument("--source-url", default="https://open.bible")
    parser.add_argument("--text-direction", default="ltr")
    parser.add_argument("--source-dir", default=str(DEFAULT_SOURCE_DIR))
    parser.add_argument("--stage-root", default=str(DEFAULT_STAGE_ROOT))
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--manifest-prefix", default=DEFAULT_MANIFEST_PREFIX)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--sample-verify", default="GEN:1,JHN:1,REV:22")
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--update-catalog", action="store_true")
    parser.add_argument("--use-staged", action="store_true")
    parser.add_argument("--skip-proxy-verify", action="store_true")
    parser.add_argument("--delete-stage-after-publish", action="store_true")
    return parser.parse_args()


def load_local_env_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def load_books() -> tuple[dict[str, BookMeta], dict[str, str]]:
    if not BOOKS_TS_PATH.exists():
        raise SystemExit(f"Missing book constants file: {BOOKS_TS_PATH}")

    books_by_id: dict[str, BookMeta] = {}
    book_name_map: dict[str, str] = {}

    for match in BOOK_ENTRY_PATTERN.finditer(BOOKS_TS_PATH.read_text()):
        book = BookMeta(
            id=match.group("id"),
            name=match.group("name"),
            chapters=int(match.group("chapters")),
            order=int(match.group("order")),
        )
        books_by_id[book.id] = book
        book_name_map[normalize_name(book.name)] = book.id

    if not books_by_id:
        raise SystemExit("Could not parse any Bible books from src/constants/books.ts")

    return books_by_id, book_name_map


def build_dataset(args: argparse.Namespace) -> DatasetSpec:
    return DatasetSpec(
        translation_id=args.translation_id.strip().lower(),
        translation_name=args.translation_name.strip(),
        abbreviation=args.abbreviation.strip(),
        language_code=args.language_code.strip().lower(),
        language_name=args.language_name.strip(),
        language_label=args.language_label.strip(),
        sort_order=int(args.sort_order),
        source_url=args.source_url.strip(),
        text_direction=args.text_direction.strip(),
        source_dir=Path(args.source_dir).expanduser().resolve(),
    )


def parse_clip_filename(
    dataset: DatasetSpec,
    filename: str,
    book_name_map: dict[str, str],
) -> tuple[str, str, int, int, int]:
    match = MEDIA_FILE_PATTERN.match(filename)
    if not match:
        raise ValueError(f"Unsupported filename format: {filename}")

    language = match.group("language").strip()
    if language != dataset.language_label:
        raise ValueError(
            f"Filename language prefix {language!r} did not match expected {dataset.language_label!r}"
        )

    book_name = match.group("book").strip()
    book_id = book_name_map.get(normalize_name(book_name))
    if not book_id:
        raise ValueError(f"Could not map book name {book_name!r} to a canonical book ID")

    chapter = int(match.group("chapter"))
    verse_start = int(match.group("start"))
    verse_end = int(match.group("end"))
    if verse_start > verse_end:
        raise ValueError(f"Verse range is reversed in filename: {filename}")

    return book_id, book_name, chapter, verse_start, verse_end


def collect_source_clips(
    dataset: DatasetSpec,
    book_name_map: dict[str, str],
) -> list[SourceClip]:
    if not dataset.source_dir.exists():
        raise SystemExit(f"Dataset source directory does not exist: {dataset.source_dir}")

    clips: list[SourceClip] = []
    seen = set()

    for file_path in sorted(dataset.source_dir.rglob("*")):
        if file_path.name == ".DS_Store":
            continue

        if file_path.is_file() and file_path.suffix.lower() == ".webm":
            book_id, book_name, chapter, verse_start, verse_end = parse_clip_filename(
                dataset, file_path.name, book_name_map
            )
            dedupe_key = (book_id, chapter, verse_start, verse_end, file_path.name)
            if dedupe_key in seen:
                raise SystemExit(f"Duplicate source clip detected: {file_path}")
            seen.add(dedupe_key)
            clips.append(
                SourceClip(
                    book_id=book_id,
                    book_name=book_name,
                    chapter=chapter,
                    verse_start=verse_start,
                    verse_end=verse_end,
                    filename=file_path.name,
                    source_type="file",
                    source_path=str(file_path),
                )
            )
            continue

        if file_path.is_file() and file_path.suffix.lower() == ".zip":
            with zipfile.ZipFile(file_path) as archive:
                for member in sorted(archive.infolist(), key=lambda item: item.filename):
                    if member.is_dir():
                        continue
                    member_name = Path(member.filename).name
                    if member_name == ".DS_Store" or not member_name.lower().endswith(".webm"):
                        continue

                    book_id, book_name, chapter, verse_start, verse_end = parse_clip_filename(
                        dataset, member_name, book_name_map
                    )
                    dedupe_key = (book_id, chapter, verse_start, verse_end, member_name)
                    if dedupe_key in seen:
                        raise SystemExit(f"Duplicate source clip detected in zip: {member_name}")
                    seen.add(dedupe_key)
                    clips.append(
                        SourceClip(
                            book_id=book_id,
                            book_name=book_name,
                            chapter=chapter,
                            verse_start=verse_start,
                            verse_end=verse_end,
                            filename=member_name,
                            source_type="zip",
                            source_path=str(file_path),
                            zip_member=member.filename,
                        )
                    )

    if not clips:
        raise SystemExit(f"No source clips found in {dataset.source_dir}")

    return clips


def validate_and_group_clips(
    clips: list[SourceClip],
    books_by_id: dict[str, BookMeta],
) -> dict[tuple[str, int], list[SourceClip]]:
    grouped: dict[tuple[str, int], list[SourceClip]] = defaultdict(list)

    for clip in clips:
        book = books_by_id.get(clip.book_id)
        if not book:
            raise SystemExit(f"Unknown canonical book ID: {clip.book_id}")
        if clip.chapter < 1 or clip.chapter > book.chapters:
            raise SystemExit(
                f"Chapter {clip.chapter} is outside the canonical range for {clip.book_id}"
            )
        grouped[(clip.book_id, clip.chapter)].append(clip)

    chapters_by_book: dict[str, list[int]] = defaultdict(list)
    for (book_id, chapter), parts in grouped.items():
        sorted_parts = sorted(parts, key=lambda item: (item.verse_start, item.verse_end, item.filename))
        previous_end = None
        for part in sorted_parts:
            if previous_end is not None:
                if part.verse_start <= previous_end:
                    raise SystemExit(
                        f"Overlapping verse ranges in {book_id} {chapter}: "
                        f"{previous_end} then {part.verse_start}"
                    )
                if part.verse_start != previous_end + 1:
                    raise SystemExit(
                        f"Gap in verse ranges for {book_id} {chapter}: "
                        f"expected {previous_end + 1}, saw {part.verse_start}"
                    )
            previous_end = part.verse_end

        grouped[(book_id, chapter)] = sorted_parts
        chapters_by_book[book_id].append(chapter)

    for book_id, chapters in chapters_by_book.items():
        sorted_chapters = sorted(chapters)
        expected = list(range(sorted_chapters[0], sorted_chapters[-1] + 1))
        if sorted_chapters != expected:
            raise SystemExit(
                f"Non-contiguous chapter coverage for {book_id}: "
                f"found {sorted_chapters[0]}-{sorted_chapters[-1]} with gaps"
            )

    return grouped


def hardlink_or_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        if destination.exists():
            destination.unlink()
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def materialize_clips(
    grouped: dict[tuple[str, int], list[SourceClip]],
    materialized_root: Path,
) -> dict[tuple[str, int], list[Path]]:
    chapter_sources: dict[tuple[str, int], list[Path]] = {}

    for chapter_key, clips in grouped.items():
        materialized_paths: list[Path] = []
        for index, clip in enumerate(clips, start=1):
            destination = (
                materialized_root
                / chapter_key[0]
                / f"{chapter_key[1]:03d}"
                / f"{index:02d}-{clip.filename}"
            )
            destination.parent.mkdir(parents=True, exist_ok=True)

            if clip.source_type == "file":
                hardlink_or_copy(Path(clip.source_path), destination)
            else:
                with zipfile.ZipFile(clip.source_path) as archive:
                    with archive.open(clip.zip_member or clip.filename) as zipped, destination.open("wb") as out:
                        shutil.copyfileobj(zipped, out)

            materialized_paths.append(destination)

        chapter_sources[chapter_key] = materialized_paths

    return chapter_sources


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe_duration_seconds(file_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ],
        capture_output=True,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"ffprobe failed for {file_path}: {(result.stderr or result.stdout).strip()}"
        )

    try:
        return float(result.stdout.strip())
    except ValueError as exc:
        raise SystemExit(f"Could not parse ffprobe duration for {file_path}") from exc


def build_chapter_audio(
    chapter_key: tuple[str, int],
    source_paths: list[Path],
    output_root: Path,
) -> dict[str, object]:
    book_id, chapter = chapter_key
    output_path = output_root / "chapters" / book_id / f"{chapter}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as concat_file:
        concat_path = Path(concat_file.name)
        for source_path in source_paths:
            concat_file.write(f"file '{source_path.as_posix()}'\n")

    try:
        command = [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_path),
            "-vn",
            "-map_metadata",
            "-1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(output_path),
        ]
        completed = subprocess.run(command, capture_output=True, check=False, text=True)
        if completed.returncode != 0:
            raise SystemExit(
                f"ffmpeg failed for {book_id} {chapter}: {(completed.stderr or completed.stdout).strip()}"
            )
    finally:
        concat_path.unlink(missing_ok=True)

    bytes_size = output_path.stat().st_size
    duration_ms = int(round(ffprobe_duration_seconds(output_path) * 1000))

    return {
        "bookId": book_id,
        "chapter": chapter,
        "outputPath": str(output_path),
        "path": f"chapters/{book_id}/{chapter}.mp3",
        "bytes": bytes_size,
        "sha256": sha256_file(output_path),
        "durationMs": duration_ms,
    }


def build_all_chapter_audio(
    chapter_sources: dict[tuple[str, int], list[Path]],
    output_root: Path,
    jobs: int,
) -> list[dict[str, object]]:
    chapter_keys = sorted(chapter_sources.keys())
    results: list[dict[str, object]] = []

    with ThreadPoolExecutor(max_workers=max(1, jobs)) as executor:
        future_map = {
            executor.submit(build_chapter_audio, chapter_key, chapter_sources[chapter_key], output_root): chapter_key
            for chapter_key in chapter_keys
        }
        for future in as_completed(future_map):
            results.append(future.result())

    results.sort(key=lambda item: (str(item["bookId"]), int(item["chapter"])))
    return results


def infer_audio_coverage(book_ids: set[str], books_by_id: dict[str, BookMeta]) -> str:
    all_book_ids = {book.id for book in books_by_id.values()}
    nt_book_ids = {book.id for book in books_by_id.values() if book.order >= 40}
    if book_ids == all_book_ids:
        return "full-bible"
    if book_ids == nt_book_ids:
        return "new-testament"
    return "partial"


def build_manifest(
    dataset: DatasetSpec,
    version: str,
    generated_at: str,
    chapter_records: list[dict[str, object]],
    books_by_id: dict[str, BookMeta],
) -> dict[str, object]:
    book_summaries: dict[str, dict[str, object]] = {}
    for record in chapter_records:
        book_id = str(record["bookId"])
        book_summary = book_summaries.setdefault(
            book_id,
            {
                "name": books_by_id[book_id].name,
                "totalChapters": 0,
                "totalBytes": 0,
                "chapters": [],
            },
        )
        book_summary["totalChapters"] = int(book_summary["totalChapters"]) + 1
        book_summary["totalBytes"] = int(book_summary["totalBytes"]) + int(record["bytes"])
        book_summary["chapters"].append(
            {
                "chapter": int(record["chapter"]),
                "path": record["path"],
                "bytes": int(record["bytes"]),
                "sha256": str(record["sha256"]),
                "duration_ms": int(record["durationMs"]),
            }
        )

    ordered_books = sorted(book_summaries.keys(), key=lambda book_id: books_by_id[book_id].order)
    total_bytes = sum(int(record["bytes"]) for record in chapter_records)
    total_duration_ms = sum(int(record["durationMs"]) for record in chapter_records)
    coverage = infer_audio_coverage(set(ordered_books), books_by_id)

    return {
        "translation_id": dataset.translation_id,
        "audio_version": version,
        "generated_at": generated_at,
        "delivery_mode": "chapter",
        "storage_provider": "cloudflare-r2",
        "base_url": f"audio/{dataset.translation_id}/{version}",
        "file_ext": "mp3",
        "mime_type": "audio/mpeg",
        "cache_control": IMMUTABLE_CACHE_CONTROL,
        "coverage": coverage,
        "total_books": len(ordered_books),
        "total_chapters": len(chapter_records),
        "total_bytes": total_bytes,
        "total_duration_ms": total_duration_ms,
        "books": {
            book_id: {
                "name": book_summaries[book_id]["name"],
                "total_chapters": int(book_summaries[book_id]["totalChapters"]),
                "total_bytes": int(book_summaries[book_id]["totalBytes"]),
                "chapters": sorted(
                    book_summaries[book_id]["chapters"],
                    key=lambda chapter_record: int(chapter_record["chapter"]),
                ),
            }
            for book_id in ordered_books
        },
    }


def build_catalog_payload(
    version: str,
    generated_at: str,
    manifest: dict[str, object],
) -> dict[str, object]:
    return {
        "version": version,
        "updatedAt": generated_at,
        "audio": {
            "strategy": "stream-template",
            "coverage": manifest["coverage"],
            "baseUrl": manifest["base_url"],
            "chapterPathTemplate": "chapters/{bookId}/{chapter}.mp3",
            "fileExtension": "mp3",
            "mimeType": "audio/mpeg",
            "books": {
                book_id: {
                    "totalChapters": book_manifest["total_chapters"],
                    "totalBytes": book_manifest["total_bytes"],
                }
                for book_id, book_manifest in dict(manifest["books"]).items()
            },
        },
    }


def write_json(file_path: Path, payload: object) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, indent=2) + "\n")


def run_command(args: list[str], env: dict[str, str]) -> None:
    completed = subprocess.run(args, env=env, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit(
            f"Command failed ({completed.returncode}): {' '.join(args)}\n"
            f"{(completed.stderr or completed.stdout).strip()}"
        )


def publish_stage(stage_root: Path, manifest_paths: Iterable[Path]) -> None:
    bucket = require_env("R2_BUCKET")
    endpoint = require_env("R2_ENDPOINT")
    access_key_id = require_env("R2_ACCESS_KEY_ID")
    secret_access_key = require_env("R2_SECRET_ACCESS_KEY")

    aws_env = os.environ.copy()
    aws_env["AWS_ACCESS_KEY_ID"] = access_key_id
    aws_env["AWS_SECRET_ACCESS_KEY"] = secret_access_key
    aws_env["AWS_DEFAULT_REGION"] = "auto"
    aws_env["AWS_EC2_METADATA_DISABLED"] = "true"

    audio_stage = stage_root / "audio"
    if audio_stage.exists():
        run_command(
            [
                "aws",
                "s3",
                "sync",
                str(audio_stage),
                f"s3://{bucket}/audio",
                "--endpoint-url",
                endpoint,
                "--cache-control",
                IMMUTABLE_CACHE_CONTROL,
                "--content-type",
                "audio/mpeg",
                "--no-progress",
            ],
            aws_env,
        )

    for manifest_path in manifest_paths:
        manifest_key = manifest_path.relative_to(stage_root).as_posix()
        run_command(
            [
                "aws",
                "s3",
                "cp",
                str(manifest_path),
                f"s3://{bucket}/{manifest_key}",
                "--endpoint-url",
                endpoint,
                "--cache-control",
                MANIFEST_CACHE_CONTROL,
                "--content-type",
                "application/json",
                "--no-progress",
            ],
            aws_env,
        )


def count_remote_chapters(dataset: DatasetSpec, version: str) -> int:
    bucket = require_env("R2_BUCKET")
    endpoint = require_env("R2_ENDPOINT")
    access_key_id = require_env("R2_ACCESS_KEY_ID")
    secret_access_key = require_env("R2_SECRET_ACCESS_KEY")

    aws_env = os.environ.copy()
    aws_env["AWS_ACCESS_KEY_ID"] = access_key_id
    aws_env["AWS_SECRET_ACCESS_KEY"] = secret_access_key
    aws_env["AWS_DEFAULT_REGION"] = "auto"
    aws_env["AWS_EC2_METADATA_DISABLED"] = "true"

    completed = subprocess.run(
        [
            "aws",
            "s3",
            "ls",
            f"s3://{bucket}/audio/{dataset.translation_id}/{version}/chapters/",
            "--recursive",
            "--endpoint-url",
            endpoint,
        ],
        env=aws_env,
        capture_output=True,
        check=False,
        text=True,
    )
    if completed.returncode != 0:
        raise SystemExit(
            f"Could not list remote chapters: {(completed.stderr or completed.stdout).strip()}"
        )

    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    return len(lines)


def verify_media_proxy(version: str, sample_targets: str) -> list[dict[str, object]]:
    samples: list[dict[str, object]] = []
    for token in [item.strip() for item in sample_targets.split(",") if item.strip()]:
        book_id, chapter_text = token.split(":", 1)
        chapter = int(chapter_text)
        url = f"https://everybible.app/api/media/audio/byh/{version}/chapters/{book_id}/{chapter}.mp3"

        head_request = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(head_request) as response:
            status = getattr(response, "status", response.getcode())
            samples.append(
                {
                    "url": url,
                    "status": status,
                    "contentType": response.headers.get("Content-Type"),
                    "contentLength": response.headers.get("Content-Length"),
                }
            )

        range_request = urllib.request.Request(
            url,
            headers={"Range": "bytes=0-1"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(range_request) as response:
                status = getattr(response, "status", response.getcode())
                if status not in (200, 206):
                    raise SystemExit(f"Unexpected range status {status} for {url}")
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"Range verification failed for {url}: {exc}") from exc

    return samples


def update_translation_catalog(dataset: DatasetSpec, catalog_payload: dict[str, object]) -> None:
    supabase_url = os.environ.get("SUPABASE_URL", "").strip() or os.environ.get(
        "EXPO_PUBLIC_SUPABASE_URL", ""
    ).strip()
    if not supabase_url:
        raise SystemExit("Missing required environment variable: SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    url = (
        f"{supabase_url.rstrip('/')}/rest/v1/translation_catalog"
        f"?translation_id=eq.{dataset.translation_id}&select=translation_id"
    )
    body = json.dumps(
        {
            "catalog": catalog_payload,
            "has_audio": True,
            "has_text": False,
            "is_available": True,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=body,
        method="PATCH",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(
            f"Failed to update translation_catalog for {dataset.translation_id}: {exc.code} {error_body}"
        ) from exc

    if not payload:
        raise SystemExit(
            f"translation_catalog row not found for {dataset.translation_id}; catalog update aborted"
        )


def build_summary(
    dataset: DatasetSpec,
    version: str,
    generated_at: str,
    manifest_path: Path,
    catalog_path: Path,
    chapter_records: list[dict[str, object]],
    books_by_id: dict[str, BookMeta],
) -> dict[str, object]:
    book_ids = sorted(
        {str(record["bookId"]) for record in chapter_records},
        key=lambda book_id: books_by_id[book_id].order,
    )
    all_book_ids = [book.id for book in sorted(books_by_id.values(), key=lambda item: item.order)]
    missing_book_ids = [book_id for book_id in all_book_ids if book_id not in set(book_ids)]

    return {
        "translationId": dataset.translation_id,
        "translationName": dataset.translation_name,
        "version": version,
        "generatedAt": generated_at,
        "totalBooks": len(book_ids),
        "totalChapters": len(chapter_records),
        "totalBytes": sum(int(record["bytes"]) for record in chapter_records),
        "coverage": infer_audio_coverage(set(book_ids), books_by_id),
        "bookIds": book_ids,
        "missingBookIds": missing_book_ids,
        "manifestPath": str(manifest_path),
        "catalogPath": str(catalog_path),
    }


def main() -> None:
    args = parse_args()
    load_local_env_file()

    dataset = build_dataset(args)
    stage_root = Path(args.stage_root).expanduser().resolve()
    if args.clean and stage_root.exists():
        shutil.rmtree(stage_root)
    stage_root.mkdir(parents=True, exist_ok=True)

    manifest_path = (
        stage_root
        / args.manifest_prefix
        / dataset.translation_id
        / f"{args.version}.json"
    )
    catalog_path = (
        stage_root
        / "catalog"
        / dataset.translation_id
        / f"{args.version}.json"
    )
    summary_path = stage_root / "summary.json"

    books_by_id, book_name_map = load_books()

    if args.use_staged:
        if not manifest_path.exists() or not catalog_path.exists():
            raise SystemExit(
                "--use-staged requires existing staged manifest and catalog files for the requested version"
            )
        manifest = json.loads(manifest_path.read_text())
        catalog_payload = json.loads(catalog_path.read_text())
        summary = (
            json.loads(summary_path.read_text())
            if summary_path.exists()
            else {
                "translationId": dataset.translation_id,
                "translationName": dataset.translation_name,
                "version": args.version,
                "generatedAt": manifest.get("generated_at"),
                "totalBooks": manifest.get("total_books"),
                "totalChapters": manifest.get("total_chapters"),
                "totalBytes": manifest.get("total_bytes"),
                "coverage": manifest.get("coverage"),
                "manifestPath": str(manifest_path),
                "catalogPath": str(catalog_path),
            }
        )
        generated_at = str(summary.get("generatedAt") or manifest.get("generated_at"))
        chapter_records = [
            {
                "bookId": book_id,
                "chapter": chapter["chapter"],
                "path": chapter["path"],
                "bytes": chapter["bytes"],
                "sha256": chapter["sha256"],
                "durationMs": chapter["duration_ms"],
            }
            for book_id, book_manifest in dict(manifest["books"]).items()
            for chapter in list(book_manifest["chapters"])
        ]
    else:
        clips = collect_source_clips(dataset, book_name_map)
        grouped = validate_and_group_clips(clips, books_by_id)

        materialized_root = stage_root / "materialized-clips" / dataset.translation_id
        output_root = stage_root / "audio" / dataset.translation_id / args.version
        chapter_sources = materialize_clips(grouped, materialized_root)
        chapter_records = build_all_chapter_audio(chapter_sources, output_root, args.jobs)

        generated_at = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
        manifest = build_manifest(dataset, args.version, generated_at, chapter_records, books_by_id)
        catalog_payload = build_catalog_payload(args.version, generated_at, manifest)
        summary = build_summary(
            dataset,
            args.version,
            generated_at,
            manifest_path,
            catalog_path,
            chapter_records,
            books_by_id,
        )

        write_json(manifest_path, manifest)
        write_json(catalog_path, catalog_payload)
        write_json(summary_path, summary)

    output = {
        "translationId": dataset.translation_id,
        "version": args.version,
        "stageRoot": str(stage_root),
        "totalSourceClips": None if args.use_staged else len(clips),
        "totalChapters": len(chapter_records),
        "manifestPath": str(manifest_path),
        "catalogPath": str(catalog_path),
        "summaryPath": str(summary_path),
        "publish": bool(args.publish),
        "updateCatalog": bool(args.update_catalog),
    }
    print(json.dumps(output, indent=2))

    if not args.publish:
        return

    publish_stage(stage_root, [manifest_path])
    remote_count = count_remote_chapters(dataset, args.version)
    if remote_count != len(chapter_records):
        raise SystemExit(
            f"Remote chapter count mismatch: expected {len(chapter_records)}, found {remote_count}"
        )

    proxy_samples = None
    if not args.skip_proxy_verify:
        proxy_samples = verify_media_proxy(args.version, args.sample_verify)

    if args.update_catalog:
        update_translation_catalog(dataset, catalog_payload)

    print(
        json.dumps(
            {
                "published": True,
                "remoteChapterCount": remote_count,
                "proxySamples": proxy_samples,
                "catalogUpdated": bool(args.update_catalog),
            },
            indent=2,
        )
    )

    if args.delete_stage_after_publish:
        shutil.rmtree(stage_root)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
