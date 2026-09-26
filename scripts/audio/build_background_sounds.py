#!/usr/bin/env python3
"""Build the streamed background sounds (R2 `background-sounds/v1/`) from their open originals.

Unlike the bundled tracks (build_background_music.py), these are downloaded on first play,
so each is kept to a few minutes. The player loops a sound by crossfading the end of one copy
into the start of the next (src/services/audio/backgroundMusicPlayer.ts: a 2.5 s fade started
3.2 s before the end), so every file must sound at full level right to both ends.

  * Field recordings: the steadiest stretch of SEGMENT_S seconds is kept. "Steadiest" means
    the smallest gap between its loudest moments and its typical level, which is what keeps
    out thunder, a rooster or a passing car without anyone listening through 35 minutes.
  * Music: the whole piece, with leading silence and the ring-out ending cut so the loop
    crossfade does not dip.
  * Hymns: four public-domain hymn tunes on pipe organ, each levelled, trimmed and joined with
    a short crossfade into one medley.

Every file is levelled to -20 LUFS / -1.5 dBTP (as the bundled tracks are) and encoded to AAC.

Usage:
    python3 scripts/audio/build_background_sounds.py --src <dir with originals> --out <dir>

Originals and licences: assets/audio/background/SOURCES.md ("Streamed sounds").
Needs ffmpeg (with the AudioToolbox AAC encoder, i.e. macOS) and numpy.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

from build_background_music import SR, edge_fades, encode, level, load, raised_cosine

SEGMENT_S = 180
WINDOW_S = 0.4
# The player's loop crossfade: a 2.5 s fade that starts 3.2 s before the end.
LOOP_TAIL_S = 3.2


def short_term_db(x: np.ndarray) -> np.ndarray:
    """Loudness of each 0.4 s window, in dB of RMS (a stand-in for momentary loudness)."""
    n = int(SR * WINDOW_S)
    frames = len(x) // n
    mono = x[: frames * n].mean(axis=1).reshape(frames, n)
    rms = np.sqrt((mono**2).mean(axis=1)) + 1e-9
    return 20 * np.log10(rms)


def steadiest(x: np.ndarray, seconds: float, avoid_tail_s: float = 0.0) -> tuple[np.ndarray, float]:
    """The `seconds`-long stretch whose loudest moments stand least above its typical level."""
    db = short_term_db(x)
    per_s = 1.0 / WINDOW_S
    span = int(seconds * per_s)
    usable = len(db) - int(avoid_tail_s * per_s)
    if usable <= span:
        return x, 0.0
    best_start, best_score = 0, float("inf")
    step = int(5 * per_s)
    for start in range(0, usable - span, step):
        window = db[start : start + span]
        # Peak excursion over the median, plus a small penalty for an unsteady level overall.
        score = (np.percentile(window, 99.5) - np.median(window)) + 0.25 * np.std(window)
        if score < best_score:
            best_start, best_score = start, score
    a = int(best_start * WINDOW_S * SR)
    return x[a : a + int(seconds * SR)], best_start * WINDOW_S


def soften_peaks(x: np.ndarray) -> np.ndarray:
    """Tames splashes, crackles and raindrop transients so a field recording can reach the
    target loudness before its true peak does. A slow, gentle compressor plus a limiter: the
    texture stays, only the spikes that would poke out of the bed under a voice come down.
    The input is first scaled to a fixed RMS, so the limiter always allows the same crest
    (about 18 dB) however hot or quiet the original was."""
    rms = float(np.sqrt((x**2).mean())) or 1e-9
    x = x * (10 ** (-30 / 20.0) / rms)
    raw = subprocess.run(
        [
            "ffmpeg", "-v", "error",
            "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
            "-af", "acompressor=threshold=0.063:ratio=3:attack=5:release=250:knee=6,"
            "alimiter=limit=0.25:attack=1:release=60:level=false",
            "-f", "f32le", "-ar", str(SR), "-ac", "2", "-",
        ],
        input=x.astype(np.float32).tobytes(),
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def trim_music(x: np.ndarray, head_below_db: float = 25.0, tail_below_db: float = 9.0) -> np.ndarray:
    """Cuts leading silence and the ring-out ending, relative to the piece's typical level."""
    db = short_term_db(x)
    median = np.median(db)
    sounding = np.nonzero(db > median - head_below_db)[0]
    full = np.nonzero(db > median - tail_below_db)[0]
    start = int(sounding[0] * WINDOW_S * SR) if len(sounding) else 0
    end = int((full[-1] + 1) * WINDOW_S * SR) if len(full) else len(x)
    return edge_fades(x[start:end], 0.02, 0.05)


def join(parts: list[np.ndarray], crossfade_s: float) -> np.ndarray:
    n = int(SR * crossfade_s)
    out = parts[0]
    for part in parts[1:]:
        fade = raised_cosine(n)[:, None]
        overlap = out[-n:] * fade[::-1] + part[:n] * fade
        out = np.concatenate([out[:-n], overlap, part[n:]])
    return out


def loop_report(x: np.ndarray) -> dict:
    """How far the loop tail and head sit below the file's typical level (0 = no dip)."""
    db = short_term_db(x)
    median = float(np.median(db))
    tail = db[-int(LOOP_TAIL_S / WINDOW_S) :]
    head = db[: int(2.5 / WINDOW_S)]
    return {
        "tail_dip_db": round(median - float(np.median(tail)), 1),
        "head_dip_db": round(median - float(np.median(head)), 1),
        "peak_over_median_db": round(float(np.percentile(db, 99.5)) - median, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--only", nargs="*", help="build just these sound ids")
    args = parser.parse_args()
    src = args.src
    args.out.mkdir(parents=True, exist_ok=True)

    def field(name: str, avoid_tail_s: float = 0.0):
        def build():
            original = load(src / f"{name}.ogg")
            # Short recordings still lose their first and last seconds, where a recorder
            # was being handled or the take fades.
            seconds = min(SEGMENT_S, len(original) / SR - 8 - avoid_tail_s)
            audio, offset = steadiest(original, seconds, avoid_tail_s)
            if offset == 0.0 and len(audio) == len(original):
                audio = original[int(4 * SR) : int((4 + seconds) * SR)]
                offset = 4.0
            print(f"  {name}: kept {offset:.0f}s-{offset + len(audio) / SR:.0f}s")
            return edge_fades(soften_peaks(audio), 0.02, 0.05)

        return build

    def hymns():
        tunes = ["hymn-eventide", "hymn-toplady", "hymn-when-i-survey", "hymn-green-hill"]
        parts = [level(trim_music(load(src / f"{tune}.src"), tail_below_db=14.0))[0] for tune in tunes]
        return join(parts, 1.5)

    sounds = {
        "rain": field("rain"),
        "gentle-breeze": field("gentle-breeze"),
        "summer-night": field("summer-night"),
        "waterfall": field("waterfall"),
        "birdsong": field("birdsong"),
        "shore": field("shore"),
        "fireplace": field("fireplace"),
        "church-bells": field("church-bells"),
        "village": field("village"),
        "garden": field("garden"),
        # The recording ends with a vehicle passing.
        "wilderness": field("wilderness", avoid_tail_s=30),
        "gregorian-chant": lambda: trim_music(load(src / "gregorian-chant.src")),
        "organ": lambda: trim_music(load(src / "organ-bach.src")),
        "piano-cello": lambda: trim_music(load(src / "piano-cello.src")),
        "hymns": hymns,
    }
    report = {}
    for name, build in sounds.items():
        if args.only and name not in args.only:
            continue
        audio, stats = level(build())
        path = args.out / f"{name}.m4a"
        encode(audio, path)
        report[name] = {
            "seconds": round(len(audio) / SR, 1),
            "kb": path.stat().st_size // 1024,
            **stats,
            **loop_report(audio),
        }
        print(name, json.dumps(report[name]))
    report_path = args.out / "report.json"
    previous = json.loads(report_path.read_text()) if report_path.exists() else {}
    report_path.write_text(json.dumps({**previous, **report}, indent=2))


if __name__ == "__main__":
    main()
