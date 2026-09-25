#!/usr/bin/env python3
"""Rebuild the bundled listen-mode background tracks from their OpenGameArt originals.

The app loops each track by crossfading the end of one copy into the start of the next
(src/services/audio/backgroundMusicPlayer.ts), so a track must play at full level right up
to its last seconds and start sounding at once: no fade-out ending, no silence at either end.
Every track is also levelled to the same loudness so presets sit at the same depth under the
narration.

Usage:
    python3 scripts/audio/build_background_music.py --src <dir with the originals>

The originals (all from opengameart.org, see assets/audio/background/SOURCES.md):
    003_Vaporware_2.mp3                          piano        CC0
    025_A_New_Town.mp3                           harp         CC0
    Etirwer (Looped)_0.ogg                       soft guitar  CC0
    wave_0[1-4]_cc0-18363__jasinski__alkaibeach.flac   ocean  CC0
    wave_0[1-4]_cc0-11505__transitking__wavesound.flac ocean  CC0

Needs ffmpeg (with the AudioToolbox AAC encoder, i.e. macOS) and numpy.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np

SR = 44100
TARGET_LUFS = -20.0
MAX_TRUE_PEAK_DBTP = -1.5
AAC_BITRATE = "80k"
OUT_DIR = Path(__file__).resolve().parents[2] / "assets" / "audio" / "background"


def load(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def raised_cosine(n: int) -> np.ndarray:
    return 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, n))


def edge_fades(x: np.ndarray, fade_in_s: float, fade_out_s: float) -> np.ndarray:
    y = x.copy()
    n_in, n_out = int(SR * fade_in_s), int(SR * fade_out_s)
    if n_in:
        y[:n_in] *= raised_cosine(n_in)[:, None]
    if n_out:
        y[-n_out:] *= raised_cosine(n_out)[::-1, None]
    return y


def trim(x: np.ndarray, start_s: float, end_s_from_end: float) -> np.ndarray:
    """Cuts leading silence and the fade-out ending; short edge fades avoid clicks."""
    body = x[int(SR * start_s) : len(x) - int(SR * end_s_from_end)]
    return edge_fades(body, 0.02, 0.05)


def ocean(src: Path) -> np.ndarray:
    """A continuous 90 s shoreline that loops without a seam.

    The originals are single breaking waves of 1.75-4 s. They are laid over each other at
    irregular times, levels and stereo positions on a circular timeline (a wave running past
    the end wraps onto the start), above a soft wash synthesised as periodic brown noise with
    a slow swell, so the loop point is invisible.
    """
    length = 90 * SR
    rng = np.random.default_rng(20260925)

    # Wash: brown noise shaped in the frequency domain. An inverse FFT of length N is
    # exactly periodic in N, so the bed loops seamlessly by construction.
    freqs = np.fft.rfftfreq(length, 1.0 / SR)
    shape = np.zeros_like(freqs)
    audible = freqs >= 40.0
    shape[audible] = (1.0 / freqs[audible]) / (1.0 + (freqs[audible] / 1400.0) ** 2)
    bed = np.stack(
        [
            np.fft.irfft(shape * np.exp(2j * np.pi * rng.random(len(freqs))), n=length)
            for _ in range(2)
        ],
        axis=1,
    )
    bed /= np.sqrt((bed**2).mean())
    t = np.arange(length) / length
    swell_db = 3.0 * np.sin(2 * np.pi * 9 * t + 0.7) + 1.5 * np.sin(2 * np.pi * 14 * t + 2.1)
    bed *= (10 ** (swell_db / 20.0))[:, None] * 10 ** (-38 / 20.0)

    clips = [
        edge_fades(load(p), 0.25, 0.4) for p in sorted(src.glob("wave_0[1-4]_cc0-*.flac"))
    ]
    assert len(clips) == 8, f"expected 8 wave clips, found {len(clips)}"
    waves = np.zeros((length, 2))
    cursor, previous = 0, -1
    while cursor < length:
        index = int(rng.integers(len(clips)))
        if index == previous:
            index = (index + 1) % len(clips)
        previous = index
        clip = clips[index] * 10 ** (rng.uniform(-5.0, 0.0) / 20.0)
        pan = rng.uniform(-0.35, 0.35)
        clip = clip * np.array([1.0 - pan, 1.0 + pan])
        positions = (cursor + np.arange(len(clip))) % length
        np.add.at(waves, positions, clip)
        cursor += int(len(clip) * rng.uniform(0.45, 0.75))
    return waves + bed


def measure(x: np.ndarray) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBTP), via ffmpeg's EBU R128 meter."""
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        write_wav(x, Path(tmp.name))
        out = subprocess.run(
            ["ffmpeg", "-nostats", "-i", tmp.name, "-af", "ebur128=peak=true", "-f", "null", "-"],
            capture_output=True,
            text=True,
            check=True,
        ).stderr
    summary = out[out.rindex("Summary:") :]
    lufs = float(summary.split("I:")[1].split()[0])
    peak = float(summary.split("Peak:")[1].split()[0])
    return lufs, peak


def write_wav(x: np.ndarray, path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", str(path)],
        input=x.astype(np.float32).tobytes(),
        check=True,
    )


def level(x: np.ndarray) -> tuple[np.ndarray, dict]:
    lufs, peak = measure(x)
    gain_db = min(TARGET_LUFS - lufs, MAX_TRUE_PEAK_DBTP - peak)
    y = x * 10 ** (gain_db / 20.0)
    lufs_after, peak_after = measure(y)
    return y, {"lufs": round(lufs_after, 1), "true_peak_dbtp": round(peak_after, 1)}


def encode(x: np.ndarray, path: Path) -> None:
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        write_wav(x, Path(tmp.name))
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-c:a", "aac_at", "-b:a", AAC_BITRATE, str(path)],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", type=Path, required=True, help="directory holding the originals")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    # Cut points: past the leading silence and before the fade-out ending (piano: 1.5 s of
    # silence, a final chord ringing out over 5 s; harp: dies away over ~4.5 s; soft guitar:
    # even the "(Looped)" original fades out over 2 s). Within that, each pair was chosen by
    # searching 0.1 s steps for the cut whose simulated loop crossfade (the player's 2.5 s
    # fade, started 3.2 s before the end) dips least: no deeper than the piece's own 10th
    # percentile quiet moments.
    tracks = {
        "piano": lambda: trim(load(args.src / "003_Vaporware_2.mp3"), 1.5, 7.0),
        "harp": lambda: trim(load(args.src / "025_A_New_Town.mp3"), 1.4, 6.5),
        "soft-guitar": lambda: trim(load(args.src / "Etirwer (Looped)_0.ogg"), 1.2, 6.8),
        "ocean-waves": lambda: ocean(args.src),
    }
    report = {}
    for name, build in tracks.items():
        audio, stats = level(build())
        encode(audio, args.out / f"{name}.m4a")
        report[name] = {"seconds": round(len(audio) / SR, 2), **stats}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
