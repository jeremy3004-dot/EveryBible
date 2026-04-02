#!/usr/bin/env python3
"""Mirror public-domain Bible audio into Cloudflare R2.

Supported sources:
- `bsb`: existing public Supabase bucket objects
- `web`: eBible.org public chapter mp3 files

Uploads are skipped when the destination object already exists.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests


ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = ROOT / "assets" / "databases" / "bible-bsb-v2.db"
MAX_WORKERS = 6
AWS_DEFAULT_REGION = "auto"


CANONICAL_BOOK_ORDER = [
    "GEN",
    "EXO",
    "LEV",
    "NUM",
    "DEU",
    "JOS",
    "JDG",
    "RUT",
    "1SA",
    "2SA",
    "1KI",
    "2KI",
    "1CH",
    "2CH",
    "EZR",
    "NEH",
    "EST",
    "JOB",
    "PSA",
    "PRO",
    "ECC",
    "SNG",
    "ISA",
    "JER",
    "LAM",
    "EZK",
    "DAN",
    "HOS",
    "JOL",
    "AMO",
    "OBA",
    "JON",
    "MIC",
    "NAM",
    "HAB",
    "ZEP",
    "HAG",
    "ZEC",
    "MAL",
    "MAT",
    "MRK",
    "LUK",
    "JHN",
    "ACT",
    "ROM",
    "1CO",
    "2CO",
    "GAL",
    "EPH",
    "PHP",
    "COL",
    "1TH",
    "2TH",
    "1TI",
    "2TI",
    "TIT",
    "PHM",
    "HEB",
    "JAS",
    "1PE",
    "2PE",
    "1JN",
    "2JN",
    "3JN",
    "JUD",
    "REV",
]

BOOK_PREFIXES = {
    "GEN": "002_GEN",
    "EXO": "003_EXO",
    "LEV": "004_LEV",
    "NUM": "005_NUM",
    "DEU": "006_DEU",
    "JOS": "007_JOS",
    "JDG": "008_JDG",
    "RUT": "009_RUT",
    "1SA": "010_1SA",
    "2SA": "011_2SA",
    "1KI": "012_1KI",
    "2KI": "013_2KI",
    "1CH": "014_1CH",
    "2CH": "015_2CH",
    "EZR": "016_EZR",
    "NEH": "017_NEH",
    "EST": "018_EST",
    "JOB": "019_JOB",
    "PSA": "020_PSA",
    "PRO": "021_PRO",
    "ECC": "022_ECC",
    "SNG": "023_SNG",
    "ISA": "024_ISA",
    "JER": "025_JER",
    "LAM": "026_LAM",
    "EZK": "027_EZK",
    "DAN": "028_DAN",
    "HOS": "029_HOS",
    "JOL": "030_JOL",
    "AMO": "031_AMO",
    "OBA": "032_OBA",
    "JON": "033_JON",
    "MIC": "034_MIC",
    "NAM": "035_NAM",
    "HAB": "036_HAB",
    "ZEP": "037_ZEP",
    "HAG": "038_HAG",
    "ZEC": "039_ZEC",
    "MAL": "040_MAL",
    "MAT": "070_MAT",
    "MRK": "071_MRK",
    "LUK": "072_LUK",
    "JHN": "073_JHN",
    "ACT": "074_ACT",
    "ROM": "075_ROM",
    "1CO": "076_1CO",
    "2CO": "077_2CO",
    "GAL": "078_GAL",
    "EPH": "079_EPH",
    "PHP": "080_PHP",
    "COL": "081_COL",
    "1TH": "082_1TH",
    "2TH": "083_2TH",
    "1TI": "084_1TI",
    "2TI": "085_2TI",
    "TIT": "086_TIT",
    "PHM": "087_PHM",
    "HEB": "088_HEB",
    "JAS": "089_JAS",
    "1PE": "090_1PE",
    "2PE": "091_2PE",
    "1JN": "092_1JN",
    "2JN": "093_2JN",
    "3JN": "094_3JN",
    "JUD": "095_JUD",
    "REV": "096_REV",
}


@dataclass(frozen=True)
class AudioSource:
    translation: str
    book_id: str
    chapter: int
    source_url: str
    destination_key: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--translation",
        choices=["bsb", "web", "all"],
        default="all",
        help="Audio source to mirror.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help="Maximum concurrent uploads.",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def chapter_counts_for_translation(translation_id: str) -> list[tuple[str, int]]:
    connection = sqlite3.connect(DATABASE_PATH)
    try:
        rows = connection.execute(
            """
            select book_id, max(chapter) as chapter_count
            from verses
            where translation_id = ?
            group by book_id
            order by min(id)
            """,
            (translation_id,),
        ).fetchall()
    finally:
        connection.close()

    return [(str(book_id), int(chapter_count)) for book_id, chapter_count in rows]


def build_sources(translation: str, supabase_url: str) -> list[AudioSource]:
    if translation == "bsb":
        return [
            AudioSource(
                translation="bsb",
                book_id=book_id,
                chapter=chapter,
                source_url=f"{supabase_url.rstrip('/')}/storage/v1/object/public/bible-audio/bsb/{book_id}/{chapter}.m4a",
                destination_key=f"audio/bsb/{book_id}/{chapter}.m4a",
            )
            for book_id, chapter_count in chapter_counts_for_translation("bsb")
            for chapter in range(1, chapter_count + 1)
        ]

    if translation == "web":
        return [
            AudioSource(
                translation="web",
                book_id=book_id,
                chapter=chapter,
                source_url=(
                    f"https://ebible.org/eng-webbe/mp3/"
                    f"eng-webbe_{BOOK_PREFIXES[book_id]}_"
                    f"{chapter_filename_segment(book_id, chapter)}.mp3"
                ),
                destination_key=f"audio/web/{book_id}/{chapter}.mp3",
            )
            for book_id, chapter_count in chapter_counts_for_translation("web")
            for chapter in range(1, chapter_count + 1)
        ]

    raise ValueError(f"Unsupported translation: {translation}")


def chapter_filename_segment(book_id: str, chapter: int) -> str:
    return f"{chapter:03d}" if book_id == "PSA" else f"{chapter:02d}"


def object_exists(bucket: str, endpoint: str, key: str, env: dict[str, str]) -> bool:
    result = subprocess.run(
        [
            "aws",
            "s3api",
            "head-object",
            "--bucket",
            bucket,
            "--key",
            key,
            "--endpoint-url",
            endpoint,
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def upload_file(source: AudioSource, bucket: str, endpoint: str, env: dict[str, str]) -> str:
    if object_exists(bucket, endpoint, source.destination_key, env):
        return f"skip {source.destination_key}"

    with tempfile.NamedTemporaryFile(
        prefix=f"{source.translation}-{source.book_id}-{source.chapter}-", suffix=".audio", delete=False
    ) as temporary_file:
        temp_path = Path(temporary_file.name)

    try:
        response = requests.get(source.source_url, stream=True, timeout=120)
        response.raise_for_status()

        with temp_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)

        subprocess.run(
            [
                "aws",
                "s3",
                "cp",
                str(temp_path),
                f"s3://{bucket}/{source.destination_key}",
                "--endpoint-url",
                endpoint,
            ],
            env=env,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return f"upload {source.destination_key}"
    finally:
        temp_path.unlink(missing_ok=True)


def iter_selected_sources(selection: str, supabase_url: str) -> Iterable[AudioSource]:
    if selection in {"bsb", "all"}:
        yield from build_sources("bsb", supabase_url)
    if selection in {"web", "all"}:
        yield from build_sources("web", supabase_url)


def main() -> None:
    args = parse_args()
    supabase_url = require_env("EXPO_PUBLIC_SUPABASE_URL")
    bucket = require_env("R2_BUCKET")
    endpoint = require_env("R2_ENDPOINT")
    access_key_id = require_env("R2_ACCESS_KEY_ID")
    secret_access_key = require_env("R2_SECRET_ACCESS_KEY")

    aws_env = {
        **os.environ,
        "AWS_ACCESS_KEY_ID": access_key_id,
        "AWS_SECRET_ACCESS_KEY": secret_access_key,
        "AWS_DEFAULT_REGION": AWS_DEFAULT_REGION,
        "AWS_EC2_METADATA_DISABLED": "true",
    }

    sources = list(iter_selected_sources(args.translation, supabase_url))
    print(f"Mirroring {len(sources)} audio files to {bucket}...")

    uploaded = 0
    skipped = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {
            executor.submit(upload_file, source, bucket, endpoint, aws_env): source
            for source in sources
        }

        for future in as_completed(future_map):
            source = future_map[future]
            try:
                result = future.result()
            except Exception as exc:
                failed += 1
                print(f"error {source.destination_key}: {exc}")
                continue

            print(result)
            if result.startswith("upload "):
                uploaded += 1
            else:
                skipped += 1

    print(
        {
            "translation": args.translation,
            "total": len(sources),
            "uploaded": uploaded,
            "skipped": skipped,
            "failed": failed,
            "bucket": bucket,
        }
    )
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
