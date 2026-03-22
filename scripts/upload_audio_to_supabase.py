#!/usr/bin/env python3
"""
Upload Bible audio files to Supabase Storage (bible-audio bucket).

Usage:
  python3 scripts/upload_audio_to_supabase.py --dir /path/to/audio --translation bsb
  python3 scripts/upload_audio_to_supabase.py --dir /path/to/audio --translation web --testament OT
  python3 scripts/upload_audio_to_supabase.py --dir /path/to/audio --translation bsb --book GEN

Audio files must be named: {chapter}.mp3 (e.g. 1.mp3, 2.mp3, ...)
and organized under: {dir}/{bookId}/{chapter}.mp3

Requires:
  pip install supabase python-dotenv
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from supabase import create_client
    from dotenv import load_dotenv
except ImportError:
    print("Missing dependencies. Run: pip install supabase python-dotenv")
    sys.exit(1)

BUCKET = "bible-audio"

OT_BOOKS = [
    "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA",
    "1KI","2KI","1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO",
    "ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS","JOL","AMO",
    "OBA","JON","MIC","NAH","HAB","ZEP","HAG","ZEC","MAL",
]

NT_BOOKS = [
    "MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH",
    "PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS",
    "1PE","2PE","1JN","2JN","3JN","JUD","REV",
]


def upload_file(supabase, local_path: Path, storage_path: str) -> bool:
    """Upload a single file, skip if already exists."""
    try:
        with open(local_path, "rb") as f:
            data = f.read()
        supabase.storage.from_(BUCKET).upload(
            storage_path,
            data,
            {"content-type": "audio/mpeg", "upsert": "false"},
        )
        print(f"  ✓ {storage_path}")
        return True
    except Exception as e:
        msg = str(e)
        if "already exists" in msg.lower() or "duplicate" in msg.lower():
            print(f"  · {storage_path} (already uploaded)")
            return True
        print(f"  ✗ {storage_path}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Upload Bible audio to Supabase")
    parser.add_argument("--dir", required=True, help="Root directory containing {bookId}/{chapter}.mp3 files")
    parser.add_argument("--translation", required=True, help="Translation ID (e.g. bsb, web, kjv)")
    parser.add_argument("--testament", choices=["OT", "NT"], help="Only upload OT or NT")
    parser.add_argument("--book", help="Only upload a specific book (e.g. GEN)")
    parser.add_argument("--env", default=".env", help="Path to .env file")
    args = parser.parse_args()

    load_dotenv(args.env)
    url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("ERROR: Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    supabase = create_client(url, key)
    root = Path(args.dir)

    if args.book:
        books = [args.book.upper()]
    elif args.testament == "OT":
        books = OT_BOOKS
    elif args.testament == "NT":
        books = NT_BOOKS
    else:
        books = OT_BOOKS + NT_BOOKS

    total = uploaded = skipped = failed = 0

    for book_id in books:
        book_dir = root / book_id
        if not book_dir.exists():
            book_dir = root / book_id.lower()
        if not book_dir.exists():
            print(f"\n[{book_id}] directory not found, skipping")
            continue

        audio_files = sorted(book_dir.glob("*.mp3"), key=lambda p: int(p.stem))
        if not audio_files:
            print(f"\n[{book_id}] no .mp3 files found")
            continue

        print(f"\n[{book_id}] {len(audio_files)} chapters")
        for f in audio_files:
            storage_path = f"{args.translation}/{book_id}/{f.name}"
            total += 1
            ok = upload_file(supabase, f, storage_path)
            if ok:
                uploaded += 1
            else:
                failed += 1

    print(f"\n{'='*40}")
    print(f"Done: {uploaded}/{total} uploaded, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
