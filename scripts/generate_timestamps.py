#!/usr/bin/env python3
"""
generate_timestamps.py — Verse-level audio timestamp generation via forced alignment.

Uses stable-ts (Whisper-based forced alignment) to align Bible chapter audio
to verse text, producing one JSON file per chapter:
  data/timestamps/{translation}/{bookId}/{chapter}.json
  Format: {"1": 0.0, "2": 4.2, "3": 8.7, ...}  (verse number → start time in seconds)

Install (once, using a venv):
    python3 -m venv .venv-timestamps
    source .venv-timestamps/bin/activate
    pip install stable-ts requests python-dotenv

    # On Apple Silicon, also install the MPS-accelerated torch build for speed:
    # (stable-ts will use CPU if MPS/CUDA not available — works fine, just slower)

Usage:
    source .venv-timestamps/bin/activate

    # Single chapter test (fast, ~10s on CPU)
    python scripts/generate_timestamps.py --translation web --book JHN --chapter 3

    # All WEB chapters (~2-4 hrs on CPU, ~30min on Apple Silicon MPS)
    python scripts/generate_timestamps.py --translation web

    # All BSB chapters (requires EXPO_PUBLIC_SUPABASE_URL in .env)
    python scripts/generate_timestamps.py --translation bsb

    # Resume interrupted run (skips existing files by default)
    python scripts/generate_timestamps.py --translation web

    # Force regenerate
    python scripts/generate_timestamps.py --translation web --force

    # Whisper model size: tiny (fastest) / base / small / medium (most accurate)
    # base is a good balance: ~74MB, ~2-5s/chapter on Apple Silicon
    python scripts/generate_timestamps.py --translation web --model base

Notes:
    - Workers > 1 share a single Whisper model, but alignment calls are serialized
      because stable-ts can fail under concurrent align() requests.
    - The Whisper model is downloaded once to ~/.cache/whisper on first run.
    - Forced alignment uses the verse text as the source of truth — Whisper
      does NOT re-transcribe, it just finds when each verse starts.
"""

import os
import sys
import json
import time
import argparse
import tempfile
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    sys.exit("Missing: pip install requests")

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv optional; export env vars manually if needed

# ─────────────────────────── Book metadata ───────────────────────────
# (bookId, eBible WEBBE prefix, chapter count)
BOOKS = [
    ("GEN", "002_GEN", 50), ("EXO", "003_EXO", 40), ("LEV", "004_LEV", 27),
    ("NUM", "005_NUM", 36), ("DEU", "006_DEU", 34), ("JOS", "007_JOS", 24),
    ("JDG", "008_JDG", 21), ("RUT", "009_RUT", 4),  ("1SA", "010_1SA", 31),
    ("2SA", "011_2SA", 24), ("1KI", "012_1KI", 22), ("2KI", "013_2KI", 25),
    ("1CH", "014_1CH", 29), ("2CH", "015_2CH", 36), ("EZR", "016_EZR", 10),
    ("NEH", "017_NEH", 13), ("EST", "018_EST", 10), ("JOB", "019_JOB", 42),
    ("PSA", "020_PSA", 150),("PRO", "021_PRO", 31), ("ECC", "022_ECC", 12),
    ("SNG", "023_SNG", 8),  ("ISA", "024_ISA", 66), ("JER", "025_JER", 52),
    ("LAM", "026_LAM", 5),  ("EZK", "027_EZK", 48), ("DAN", "028_DAN", 12),
    ("HOS", "029_HOS", 14), ("JOL", "030_JOL", 3),  ("AMO", "031_AMO", 9),
    ("OBA", "032_OBA", 1),  ("JON", "033_JON", 4),  ("MIC", "034_MIC", 7),
    ("NAM", "035_NAM", 3),  ("HAB", "036_HAB", 3),  ("ZEP", "037_ZEP", 3),
    ("HAG", "038_HAG", 2),  ("ZEC", "039_ZEC", 14), ("MAL", "040_MAL", 4),
    ("MAT", "070_MAT", 28), ("MRK", "071_MRK", 16), ("LUK", "072_LUK", 24),
    ("JHN", "073_JHN", 21), ("ACT", "074_ACT", 28), ("ROM", "075_ROM", 16),
    ("1CO", "076_1CO", 16), ("2CO", "077_2CO", 13), ("GAL", "078_GAL", 6),
    ("EPH", "079_EPH", 6),  ("PHP", "080_PHP", 4),  ("COL", "081_COL", 4),
    ("1TH", "082_1TH", 5),  ("2TH", "083_2TH", 3),  ("1TI", "084_1TI", 6),
    ("2TI", "085_2TI", 4),  ("TIT", "086_TIT", 3),  ("PHM", "087_PHM", 1),
    ("HEB", "088_HEB", 13), ("JAS", "089_JAS", 5),  ("1PE", "090_1PE", 5),
    ("2PE", "091_2PE", 3),  ("1JN", "092_1JN", 5),  ("2JN", "093_2JN", 1),
    ("3JN", "094_3JN", 1),  ("JUD", "095_JUD", 1),  ("REV", "096_REV", 22),
]

BOOK_CHAPTER_COUNTS = {b: c for b, _, c in BOOKS}
EBIBLE_PREFIXES = {b: p for b, p, _ in BOOKS}

# ─────────────────────────── Audio URL builders ───────────────────────────

def web_audio_url(book_id: str, chapter: int) -> str:
    asset_base = os.environ.get("EXPO_PUBLIC_BIBLE_ASSET_BASE_URL", "").rstrip("/")
    if asset_base:
        return f"{asset_base}/audio/web/{book_id}/{chapter}.mp3"
    prefix = EBIBLE_PREFIXES[book_id]
    ch_str = f"{chapter:03d}" if book_id == "PSA" else f"{chapter:02d}"
    return f"https://ebible.org/eng-webbe/mp3/eng-webbe_{prefix}_{ch_str}.mp3"


def bsb_audio_url(book_id: str, chapter: int) -> str:
    asset_base = os.environ.get("EXPO_PUBLIC_BIBLE_ASSET_BASE_URL", "").rstrip("/")
    if asset_base:
        return f"{asset_base}/audio/bsb/{book_id}/{chapter}.m4a"
    return f"https://everybible.app/api/media/audio/bsb/{book_id}/{chapter}.m4a"


# ─────────────────────────── Verse text loading ───────────────────────────

def load_verse_index(translation: str) -> dict[tuple[str, int], list[dict]]:
    """Load processed JSON and index by (bookId, chapter)."""
    data_dir = Path(__file__).parent.parent / "data"
    filename = "web_processed.json" if translation == "web" else "bsb_processed.json"
    path = data_dir / filename
    if not path.exists():
        sys.exit(f"Verse data not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    index: dict[tuple[str, int], list[dict]] = {}
    for row in data["verses"]:
        key = (row["b"], row["c"])
        index.setdefault(key, []).append({"v": row["v"], "t": row["t"], "h": row.get("h")})
    return index


# ─────────────────────────── Audio download ───────────────────────────

def download_audio(url: str, dest: Path) -> bool:
    """Download audio to dest. Returns True on success."""
    try:
        resp = requests.get(url, timeout=60, stream=True)
        if resp.status_code != 200:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
        return True
    except Exception:
        return False


# ─────────────────────────── stable-ts alignment ───────────────────────────

_model = None
_model_lock = threading.Lock()
_align_lock = threading.Lock()


def get_model(model_name: str):
    """Lazy-load the Whisper model (shared across threads)."""
    global _model
    with _model_lock:
        if _model is None:
            try:
                import stable_whisper
            except ImportError:
                sys.exit(
                    "Missing: pip install stable-ts\n"
                    "See the script header for full setup instructions."
                )
            print(f"Loading Whisper model '{model_name}'... ", end="", flush=True)
            _model = stable_whisper.load_model(model_name)
            print("ready.")
    return _model


def align_chapter(
    audio_path: Path,
    verses: list[dict],
    output_path: Path,
    model,
) -> bool:
    """
    Forced-align one chapter's audio to verse texts using stable-ts.
    Returns True on success.
    """
    # Build one text block per verse (include heading for accurate timing)
    texts = []
    for verse in verses:
        heading = verse.get("h") or ""
        text = verse["t"]
        fragment = f"{heading} {text}".strip() if heading else text
        texts.append(fragment)

    # Join all verse texts into one document; stable-ts will align at segment boundaries
    full_text = "\n".join(texts)

    try:
        # Preserve our verse-per-line input so stable-ts returns one segment per verse
        # instead of regrouping into many smaller chunks that force the rough fallback path.
        # stable-ts also appears to be unsafe under concurrent align() calls on one model.
        with _align_lock:
            result = model.align(
                str(audio_path),
                full_text,
                language="en",
                original_split=True,
            )

        # stable-ts returns segments roughly corresponding to our input lines.
        # Map segment index → verse.
        segments = result.segments
        if not segments:
            return False

        timestamps: dict[str, float] = {}

        if len(segments) == len(verses):
            # Perfect 1:1 alignment
            for seg, verse in zip(segments, verses):
                timestamps[str(verse["v"])] = round(seg.start, 3)
        else:
            # Fallback: distribute segments proportionally across verses
            # This happens when Whisper merges or splits lines.
            # Use the first segment's start for each verse based on cumulative progress.
            total_segs = len(segments)
            for i, verse in enumerate(verses):
                seg_idx = min(round(i * total_segs / len(verses)), total_segs - 1)
                timestamps[str(verse["v"])] = round(segments[seg_idx].start, 3)

        if not timestamps:
            return False

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(timestamps, f, separators=(",", ":"))
        return True

    except Exception as e:
        print(f"    align error: {e}", file=sys.stderr)
        return False


# ─────────────────────────── Per-chapter worker ───────────────────────────

def process_chapter(
    translation: str,
    book_id: str,
    chapter: int,
    verses: list[dict],
    output_path: Path,
    audio_url: str,
    force: bool,
    model,
) -> tuple[str, bool, str]:
    """Returns (label, success, reason)."""
    label = f"{book_id} {chapter}"

    if not force and output_path.exists():
        return label, True, "skipped (exists)"

    if not verses:
        return label, False, "no verse text"

    with tempfile.TemporaryDirectory() as tmp:
        ext = ".m4a" if translation == "bsb" else ".mp3"
        audio_path = Path(tmp) / f"chapter{ext}"

        if not download_audio(audio_url, audio_path):
            return label, False, "audio download failed"

        ok = align_chapter(audio_path, verses, output_path, model)
        if ok:
            return label, True, "generated"
        else:
            return label, False, "alignment failed"


# ─────────────────────────── Public API for batch_timestamps.py ───────────────────────────

# Lazy-load the verse index once per process (shared across threads)
_verse_index: dict | None = None
_verse_index_lock = threading.Lock()


def _get_verse_index(translation_id: str) -> dict:
    global _verse_index
    with _verse_index_lock:
        if _verse_index is None:
            _verse_index = load_verse_index(translation_id)
    return _verse_index


def generate_chapter_timestamps(
    db_path: str,
    translation_id: str,
    book_id: str,
    chapter: int,
    out_path,
    force: bool,
    model_name: str = "base",
) -> bool:
    """
    Self-contained entry point called by batch_timestamps.py.
    Loads verse data + model lazily, fetches audio, runs alignment.
    Returns True on success or skip (already exists), False on failure.
    """
    out_path = Path(out_path)

    if not force and out_path.exists():
        return True

    verse_index = _get_verse_index(translation_id)
    verses = verse_index.get((book_id, chapter), [])
    if not verses:
        return False

    if translation_id == "web":
        audio_url = web_audio_url(book_id, chapter)
    else:
        audio_url = bsb_audio_url(book_id, chapter)

    model = get_model(model_name)

    _, success, _ = process_chapter(
        translation=translation_id,
        book_id=book_id,
        chapter=chapter,
        verses=verses,
        output_path=out_path,
        audio_url=audio_url,
        force=force,
        model=model,
    )
    return success


# ─────────────────────────── Main ───────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate verse timestamp JSON files via stable-ts forced alignment"
    )
    parser.add_argument("--translation", required=True, choices=["web", "bsb"],
                        help="Translation to process")
    parser.add_argument("--book", help="Single book ID (e.g. GEN)")
    parser.add_argument("--chapter", type=int, help="Single chapter number")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing output files")
    parser.add_argument("--workers", type=int, default=2,
                        help="Parallel workers (default: 2; all share one model)")
    parser.add_argument("--model", default="base",
                        choices=["tiny", "base", "small", "medium", "large"],
                        help="Whisper model size (default: base)")
    args = parser.parse_args()

    out_root = Path(__file__).parent.parent / "data" / "timestamps" / args.translation

    print(f"Loading {args.translation} verse data...")
    verse_index = load_verse_index(args.translation)

    # Pre-load model before spawning threads
    model = get_model(args.model)

    # Build task list
    if args.book:
        books_to_process = [(b, p, c) for b, p, c in BOOKS if b == args.book.upper()]
        if not books_to_process:
            sys.exit(f"Unknown book: {args.book}")
    else:
        books_to_process = BOOKS

    tasks = []
    for book_id, _, chapter_count in books_to_process:
        chapters = [args.chapter] if args.chapter else range(1, chapter_count + 1)
        for ch in chapters:
            verses = verse_index.get((book_id, ch), [])
            output_path = out_root / book_id / f"{ch}.json"
            if args.translation == "web":
                audio_url = web_audio_url(book_id, ch)
            else:
                audio_url = bsb_audio_url(book_id, ch)
            tasks.append((
                args.translation, book_id, ch, verses,
                output_path, audio_url, args.force, model,
            ))

    total = len(tasks)
    done = 0
    succeeded = 0
    failed = []
    skipped = 0
    start_time = time.time()

    print(f"\nProcessing {total} chapters with {args.workers} workers...\n")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_chapter, *task): task for task in tasks}
        for future in as_completed(futures):
            label, ok, reason = future.result()
            done += 1
            if "skipped" in reason:
                skipped += 1
            elif ok:
                succeeded += 1
            else:
                failed.append((label, reason))

            elapsed = time.time() - start_time
            eta = (elapsed / done) * (total - done) if done > 0 else 0
            status = "✓" if ok else "✗"
            print(
                f"  [{done:4d}/{total}] {status} {label:<12} {reason:<28} "
                f"ETA {eta / 60:.1f}min",
                flush=True,
            )

    print(f"\n{'─'*50}")
    print(f"Done: {succeeded} generated, {skipped} skipped, {len(failed)} failed")
    print(f"Output: {out_root}")

    if failed:
        print("\nFailed chapters:")
        for label, reason in failed:
            print(f"  {label}: {reason}")

    if succeeded > 0:
        print(f"\nNext step: upload to Supabase with:")
        print(f"  python scripts/upload_timestamps.py --translation {args.translation}")


if __name__ == "__main__":
    main()
