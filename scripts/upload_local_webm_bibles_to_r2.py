#!/usr/bin/env python3
"""Upload local WebM Bible corpora to Cloudflare R2.

This script is designed for local/operator-only corpora like the Bhujel and
Rasuwa Tamang files on Desktop. It stages immutable, versioned object keys and
preserves verse-range filenames so split chapters never collide in R2.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_ROOT = Path("/Users/dev/Desktop/Rasuwa and Bhujel")
DEFAULT_STAGE_ROOT = ROOT / "tmp" / "local-webm-r2-upload"
BOOKS_TS_PATH = ROOT / "src" / "constants" / "books.ts"

IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
MANIFEST_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=60"
DEFAULT_VERSION = f"{datetime.now().strftime('%Y.%m.%d')}-local-webm-v1"

MEDIA_FILE_PATTERN = re.compile(
    r"^(?P<language>.+?)_(?P<book>.+?)_Chapter(?P<chapter>\d{3})_V(?P<start>\d{3})_(?P<end>\d{3})\.webm$"
)
BOOK_ENTRY_PATTERN = re.compile(
    r"\{\s*id:\s*'(?P<id>[^']+)'\s*,\s*name:\s*'(?P<name>[^']+)'\s*,",
    re.MULTILINE,
)


@dataclass(frozen=True)
class DatasetSpec:
    translation_id: str
    language_label: str
    source_dir: Path


@dataclass(frozen=True)
class MediaEntry:
    translation_id: str
    language_label: str
    book_name: str
    book_id: str
    chapter: int
    verse_start: int
    verse_end: int
    filename: str
    object_key: str
    relative_source: str
    source_type: str
    source_path: str
    zip_member: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset",
        action="append",
        default=[],
        metavar="TRANSLATION_ID|LANGUAGE_LABEL|SOURCE_DIR",
        help=(
            "Repeatable dataset override. "
            "Example: byh|Bhujel|/Users/dev/Desktop/Rasuwa and Bhujel/Bhujel"
        ),
    )
    parser.add_argument(
        "--source-root",
        default=str(DEFAULT_SOURCE_ROOT),
        help="Root directory used by the built-in Bhujel/Rasuwa defaults.",
    )
    parser.add_argument(
        "--stage-root",
        default=str(DEFAULT_STAGE_ROOT),
        help="Local staging directory before upload.",
    )
    parser.add_argument(
        "--version",
        default=DEFAULT_VERSION,
        help="Immutable object version segment to publish under.",
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Actually upload staged files to R2. Without this flag, only stage + report.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove the stage root before staging fresh files.",
    )
    parser.add_argument(
        "--delete-stage-after-publish",
        action="store_true",
        help="Delete the stage root after a successful publish.",
    )
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


def build_default_datasets(source_root: Path) -> list[DatasetSpec]:
    return [
        DatasetSpec(
            translation_id="byh",
            language_label="Bhujel",
            source_dir=source_root / "Bhujel",
        ),
        DatasetSpec(
            translation_id="rasuwatamang",
            language_label="Rasuwa Tamang",
            source_dir=source_root / "Rasuwa",
        ),
    ]


def parse_dataset_arg(value: str) -> DatasetSpec:
    parts = [part.strip() for part in value.split("|")]
    if len(parts) != 3 or not all(parts):
        raise SystemExit(
            "Each --dataset must use the format TRANSLATION_ID|LANGUAGE_LABEL|SOURCE_DIR"
        )
    return DatasetSpec(
        translation_id=parts[0].lower(),
        language_label=parts[1],
        source_dir=Path(parts[2]).expanduser().resolve(),
    )


def load_book_name_map() -> dict[str, str]:
    if not BOOKS_TS_PATH.exists():
        raise SystemExit(f"Missing book constants file: {BOOKS_TS_PATH}")

    book_map: dict[str, str] = {}
    for match in BOOK_ENTRY_PATTERN.finditer(BOOKS_TS_PATH.read_text()):
        book_map[normalize_name(match.group("name"))] = match.group("id")
    if not book_map:
        raise SystemExit("Could not parse any Bible book mappings from src/constants/books.ts")
    return book_map


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def parse_media_filename(
    dataset: DatasetSpec,
    filename: str,
    book_name_map: dict[str, str],
) -> tuple[str, int, int, int, str]:
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

    return (
        book_name,
        int(match.group("chapter")),
        int(match.group("start")),
        int(match.group("end")),
        book_id,
    )


def build_object_key(translation_id: str, version: str, book_id: str, filename: str) -> str:
    return f"audio/{translation_id}/{version}/clips/{book_id}/{filename}"


def collect_dataset_entries(
    dataset: DatasetSpec,
    version: str,
    book_name_map: dict[str, str],
) -> list[MediaEntry]:
    if not dataset.source_dir.exists():
        raise SystemExit(f"Dataset source directory does not exist: {dataset.source_dir}")

    entries: list[MediaEntry] = []
    object_keys: set[str] = set()

    for file_path in sorted(dataset.source_dir.rglob("*")):
        if file_path.name == ".DS_Store":
            continue

        if file_path.is_file() and file_path.suffix.lower() == ".webm":
            (
                book_name,
                chapter,
                verse_start,
                verse_end,
                book_id,
            ) = parse_media_filename(dataset, file_path.name, book_name_map)
            object_key = build_object_key(dataset.translation_id, version, book_id, file_path.name)
            if object_key in object_keys:
                raise SystemExit(f"Duplicate object key detected: {object_key}")
            object_keys.add(object_key)
            entries.append(
                MediaEntry(
                    translation_id=dataset.translation_id,
                    language_label=dataset.language_label,
                    book_name=book_name,
                    book_id=book_id,
                    chapter=chapter,
                    verse_start=verse_start,
                    verse_end=verse_end,
                    filename=file_path.name,
                    object_key=object_key,
                    relative_source=str(file_path.relative_to(dataset.source_dir)),
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

                    (
                        book_name,
                        chapter,
                        verse_start,
                        verse_end,
                        book_id,
                    ) = parse_media_filename(dataset, member_name, book_name_map)
                    object_key = build_object_key(
                        dataset.translation_id,
                        version,
                        book_id,
                        member_name,
                    )
                    if object_key in object_keys:
                        raise SystemExit(f"Duplicate object key detected: {object_key}")
                    object_keys.add(object_key)
                    entries.append(
                        MediaEntry(
                            translation_id=dataset.translation_id,
                            language_label=dataset.language_label,
                            book_name=book_name,
                            book_id=book_id,
                            chapter=chapter,
                            verse_start=verse_start,
                            verse_end=verse_end,
                            filename=member_name,
                            object_key=object_key,
                            relative_source=str(file_path.relative_to(dataset.source_dir)),
                            source_type="zip",
                            source_path=str(file_path),
                            zip_member=member.filename,
                        )
                    )

    return entries


def hardlink_or_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        if destination.exists():
            destination.unlink()
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def stage_entries(
    stage_root: Path,
    entries: Iterable[MediaEntry],
) -> None:
    for entry in entries:
        destination = stage_root / entry.object_key
        destination.parent.mkdir(parents=True, exist_ok=True)

        if entry.source_type == "file":
            hardlink_or_copy(Path(entry.source_path), destination)
            continue

        with zipfile.ZipFile(entry.source_path) as archive:
            with archive.open(entry.zip_member or entry.filename) as zipped, destination.open("wb") as out:
                shutil.copyfileobj(zipped, out)


def build_dataset_manifest(
    dataset: DatasetSpec,
    version: str,
    entries: list[MediaEntry],
) -> dict[str, object]:
    book_counts: dict[str, int] = defaultdict(int)
    chapter_counts: dict[str, set[int]] = defaultdict(set)
    split_chapters: dict[str, list[str]] = defaultdict(list)
    chapter_parts: dict[tuple[str, int], list[MediaEntry]] = defaultdict(list)

    for entry in entries:
        book_counts[entry.book_id] += 1
        chapter_counts[entry.book_id].add(entry.chapter)
        chapter_parts[(entry.book_id, entry.chapter)].append(entry)

    for (book_id, chapter), parts in chapter_parts.items():
        if len(parts) > 1:
            split_chapters[book_id].append(str(chapter))

    return {
        "translationId": dataset.translation_id,
        "languageLabel": dataset.language_label,
        "version": version,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "objectPrefix": f"audio/{dataset.translation_id}/{version}/clips",
        "totalFiles": len(entries),
        "books": [
            {
                "bookId": book_id,
                "fileCount": book_counts[book_id],
                "chapterCount": len(chapter_counts[book_id]),
                "splitChapters": sorted(split_chapters.get(book_id, []), key=int),
            }
            for book_id in sorted(book_counts.keys())
        ],
        "files": [asdict(entry) for entry in entries],
    }


def write_manifests(
    stage_root: Path,
    datasets: list[DatasetSpec],
    version: str,
    entries_by_dataset: dict[str, list[MediaEntry]],
) -> list[Path]:
    manifest_paths: list[Path] = []

    for dataset in datasets:
        manifest_path = (
            stage_root
            / "manifests"
            / "local-webm"
            / dataset.translation_id
            / f"{version}.json"
        )
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest = build_dataset_manifest(dataset, version, entries_by_dataset[dataset.translation_id])
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        manifest_paths.append(manifest_path)

    return manifest_paths


def write_summary(
    stage_root: Path,
    datasets: list[DatasetSpec],
    version: str,
    entries_by_dataset: dict[str, list[MediaEntry]],
    manifest_paths: list[Path],
) -> Path:
    summary = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "version": version,
        "datasets": [
            {
                "translationId": dataset.translation_id,
                "languageLabel": dataset.language_label,
                "sourceDir": str(dataset.source_dir),
                "totalFiles": len(entries_by_dataset[dataset.translation_id]),
                "manifestPath": str(
                    next(
                        path for path in manifest_paths if f"/{dataset.translation_id}/" in str(path)
                    )
                ),
            }
            for dataset in datasets
        ],
    }
    summary_path = stage_root / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    return summary_path


def run_command(args: list[str], env: dict[str, str]) -> None:
    completed = subprocess.run(args, env=env, check=False)
    if completed.returncode != 0:
        raise SystemExit(f"Command failed ({completed.returncode}): {' '.join(args)}")


def publish_stage(stage_root: Path) -> None:
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
    manifests_stage = stage_root / "manifests"

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
                "--no-progress",
            ],
            aws_env,
        )

    if manifests_stage.exists():
        for manifest_path in sorted(manifests_stage.rglob("*.json")):
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


def main() -> None:
    args = parse_args()
    load_local_env_file()

    stage_root = Path(args.stage_root).expanduser().resolve()
    source_root = Path(args.source_root).expanduser().resolve()
    datasets = (
        [parse_dataset_arg(value) for value in args.dataset]
        if args.dataset
        else build_default_datasets(source_root)
    )

    if args.clean and stage_root.exists():
        shutil.rmtree(stage_root)

    stage_root.mkdir(parents=True, exist_ok=True)

    book_name_map = load_book_name_map()
    entries_by_dataset: dict[str, list[MediaEntry]] = {}

    for dataset in datasets:
        entries = collect_dataset_entries(dataset, args.version, book_name_map)
        if not entries:
            raise SystemExit(f"No media entries found for dataset {dataset.translation_id}")
        entries_by_dataset[dataset.translation_id] = entries

    for entries in entries_by_dataset.values():
        stage_entries(stage_root, entries)

    manifest_paths = write_manifests(stage_root, datasets, args.version, entries_by_dataset)
    summary_path = write_summary(stage_root, datasets, args.version, entries_by_dataset, manifest_paths)

    output = {
        "version": args.version,
        "stageRoot": str(stage_root),
        "datasets": [
            {
                "translationId": dataset.translation_id,
                "languageLabel": dataset.language_label,
                "sourceDir": str(dataset.source_dir),
                "totalFiles": len(entries_by_dataset[dataset.translation_id]),
                "objectPrefix": f"audio/{dataset.translation_id}/{args.version}/clips",
            }
            for dataset in datasets
        ],
        "manifestPaths": [str(path) for path in manifest_paths],
        "summaryPath": str(summary_path),
        "publish": bool(args.publish),
    }

    print(json.dumps(output, indent=2))

    if not args.publish:
        return

    publish_stage(stage_root)
    print(json.dumps({"published": True, "summaryPath": str(summary_path)}, indent=2))

    if args.delete_stage_after_publish:
        shutil.rmtree(stage_root)


if __name__ == "__main__":
    main()
