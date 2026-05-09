#!/usr/bin/env python3
"""
Fast BSB .m4a audio uploader to Supabase Storage.
Uses the Storage REST API directly (no CLI overhead per file).
Uploads files in parallel with configurable concurrency.

Usage: python3 scripts/upload-bsb-audio-fast.py [--dry-run] [--workers N]
"""

import os
import sys
import re
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import urllib.error

# Configuration
OT_DIR = Path("/Users/dev/Desktop/Bible App!!!/Audio Bible/BSB-32kbps/BSB_00_Souer_OT")
NT_DIR = Path("/Users/dev/Desktop/Bible App!!!/Audio Bible/BSB-32kbps/BSB_00_Souer_NT")
BUCKET = "bible-audio"
TRANSLATION = "bsb"

# Map from filename abbreviation to canonical BOOK_ID
# Special case: Tts -> TIT (Titus)
BOOK_MAP = {
    # OT
    "Gen": "GEN", "Exo": "EXO", "Lev": "LEV", "Num": "NUM", "Deu": "DEU",
    "Jos": "JOS", "Jdg": "JDG", "Rut": "RUT", "1Sa": "1SA", "2Sa": "2SA",
    "1Ki": "1KI", "2Ki": "2KI", "1Ch": "1CH", "2Ch": "2CH", "Ezr": "EZR",
    "Neh": "NEH", "Est": "EST", "Job": "JOB", "Psa": "PSA", "Pro": "PRO",
    "Ecc": "ECC", "Sng": "SNG", "Isa": "ISA", "Jer": "JER", "Lam": "LAM",
    "Ezk": "EZK", "Dan": "DAN", "Hos": "HOS", "Jol": "JOL", "Amo": "AMO",
    "Oba": "OBA", "Jon": "JON", "Mic": "MIC", "Nam": "NAM", "Hab": "HAB",
    "Zep": "ZEP", "Hag": "HAG", "Zec": "ZEC", "Mal": "MAL",
    # NT
    "Mat": "MAT", "Mrk": "MRK", "Luk": "LUK", "Jhn": "JHN", "Act": "ACT",
    "Rom": "ROM", "1Co": "1CO", "2Co": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Php": "PHP", "Col": "COL", "1Th": "1TH", "2Th": "2TH", "1Ti": "1TI",
    "2Ti": "2TI", "Tts": "TIT", "Phm": "PHM", "Heb": "HEB", "Jas": "JAS",
    "1Pe": "1PE", "2Pe": "2PE", "1Jn": "1JN", "2Jn": "2JN", "3Jn": "3JN",
    "Jud": "JUD", "Rev": "REV",
}

PATTERN = re.compile(r"^BSB_\d+_([A-Za-z0-9]+)_(\d+)\.m4a$")


def require_env(name: str) -> str:
    """Read a required environment variable."""
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"ERROR: Set {name} in your environment")
    return value


def collect_files():
    """Collect all .m4a files and parse into (local_path, book_id, chapter) tuples."""
    files = []
    for directory in [OT_DIR, NT_DIR]:
        for filepath in sorted(directory.glob("*.m4a")):
            m = PATTERN.match(filepath.name)
            if not m:
                print(f"  [SKIP] Unexpected filename: {filepath.name}")
                continue
            abbr = m.group(1)
            chapter = int(m.group(2))  # strips leading zeros
            book_id = BOOK_MAP.get(abbr)
            if not book_id:
                print(f"  [ERROR] Unknown abbreviation: {abbr} ({filepath.name})")
                continue
            files.append((filepath, book_id, chapter))
    return files


def upload_file(
    filepath: Path,
    book_id: str,
    chapter: int,
    dry_run: bool,
    supabase_url: str,
    service_key: str,
) -> tuple[bool, str]:
    """Upload a single file. Returns (success, message)."""
    dest_path = f"{BUCKET}/{TRANSLATION}/{book_id}/{chapter}.m4a"

    if dry_run:
        return True, f"[DRY RUN] {filepath.name} -> {dest_path}"

    url = f"{supabase_url.rstrip('/')}/storage/v1/object/{dest_path}"

    with open(filepath, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "audio/mp4",
            "x-upsert": "true",  # overwrite if exists
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status in (200, 201):
                return True, f"OK {book_id}/{chapter}.m4a"
            else:
                return False, f"HTTP {resp.status} for {book_id}/{chapter}.m4a"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        return False, f"HTTP {e.code} for {book_id}/{chapter}.m4a: {body}"
    except Exception as e:
        return False, f"Error for {book_id}/{chapter}.m4a: {e}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=8, help="Parallel upload workers")
    args = parser.parse_args()

    if args.dry_run:
        print("[DRY RUN] No files will be uploaded.")

    supabase_url = ""
    service_key = ""
    if not args.dry_run:
        supabase_url = require_env("SUPABASE_URL")
        service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    files = collect_files()
    total = len(files)
    print(f"Found {total} .m4a files to upload")
    print(f"Workers: {args.workers}")
    print()

    success = 0
    failed = 0
    completed = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_file = {
            executor.submit(
                upload_file,
                fp,
                book_id,
                chapter,
                args.dry_run,
                supabase_url,
                service_key,
            ): (fp, book_id, chapter)
            for fp, book_id, chapter in files
        }

        for future in as_completed(future_to_file):
            fp, book_id, chapter = future_to_file[future]
            completed += 1
            ok, msg = future.result()
            if ok:
                success += 1
                print(f"  [{completed}/{total}] {msg}")
            else:
                failed += 1
                print(f"  [{completed}/{total}] [ERROR] {msg}")

    print()
    print(f"Upload complete: {success} succeeded, {failed} failed, {total} total")
    if failed > 0:
        print(f"[WARNING] {failed} files failed to upload")
        sys.exit(1)


if __name__ == "__main__":
    main()
