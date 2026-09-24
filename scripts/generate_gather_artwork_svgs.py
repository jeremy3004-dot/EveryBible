#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import base64
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ICON_REGISTRY_PATH = ROOT / "src" / "data" / "gatherIcons.ts"
SOURCE_DIR = ROOT / "scripts" / "gather-svg"
REGISTRY_OUTPUT_PATH = ROOT / "src" / "data" / "gatherArtwork.ts"
ARTWORK_OUTPUT_DIR = ROOT / "src" / "data" / "gatherArtworkSvg"
PRINT_WIDTH = 100


def read_icon_registry_entries() -> list[tuple[str, str]]:
    source = ICON_REGISTRY_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r"'([^']+)':\s*require\('\.\./\.\./assets/icons/gather/([^']+)\.png'\)"
    )
    entries = pattern.findall(source)
    if not entries:
        raise RuntimeError(f"Could not find Gather icon mappings in {ICON_REGISTRY_PATH}")
    return entries


def cleanup_svg(svg_text: str) -> str:
    svg_text = re.sub(r"^<\?xml[^>]*>\n?", "", svg_text)
    svg_text = re.sub(r"^<!-- Generator:[\s\S]*?-->\n?", "", svg_text)
    svg_text = re.sub(r"<metadata>[\s\S]*?</metadata>", "", svg_text)
    svg_text = re.sub(r"<path d=\"\"[^>]*/>\n?", "", svg_text)
    svg_text = re.sub(r" fill=\"#(?:000000|000)\"", ' fill="#000000"', svg_text)
    svg_text = re.sub(r" stroke=\"#(?:000000|000)\"", ' stroke="#000000"', svg_text)
    return svg_text.strip() + "\n"


def build_bitmap_svg(svg_text: str) -> str | None:
    match = re.search(r'(?:xlink:href|href)="(data:image/png;base64,[^"]+)"', svg_text)
    if not match:
        return None

    encoded_image = match.group(1).split(",", 1)[1]
    image = Image.open(BytesIO(base64.b64decode(encoded_image))).convert("RGBA")
    grayscale = image.convert("L")

    # These Canva exports are white artwork on an opaque black background.
    # Convert luminance into alpha so black disappears and the icon can tint cleanly.
    alpha = grayscale
    opaque_mask = alpha.point(lambda value: 255 if value > 12 else 0)
    bbox = opaque_mask.getbbox()

    if bbox is None:
        return None

    trimmed_alpha = alpha.crop(bbox)
    trimmed = Image.new("RGBA", trimmed_alpha.size, (255, 255, 255, 0))
    trimmed.putalpha(trimmed_alpha)

    max_dimension = 512
    if max(trimmed.size) > max_dimension:
        scale = max_dimension / max(trimmed.size)
        resized_width = max(1, round(trimmed.width * scale))
        resized_height = max(1, round(trimmed.height * scale))
        trimmed = trimmed.resize((resized_width, resized_height), Image.Resampling.LANCZOS)

    output = BytesIO()
    trimmed.save(output, format="PNG")
    cleaned_base64 = base64.b64encode(output.getvalue()).decode("ascii")

    width, height = trimmed.size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<image href="data:image/png;base64,{cleaned_base64}" width="{width}" height="{height}"/>'
        f"</svg>\n"
    )


def write_registry(entries: list[tuple[str, str]]) -> None:
    # One JSON module per artwork (a JSON string of SVG markup), required the first
    # time a badge draws it. Home draws one ~2 KB foundation mark on its first render;
    # the topic artworks embed PNG payloads and weigh ~750 KB together.
    ARTWORK_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    keys = {key for key, _ in entries}
    for stale in ARTWORK_OUTPUT_DIR.glob("*.json"):
        if stale.stem not in keys:
            stale.unlink()
    for key, svg_text in entries:
        (ARTWORK_OUTPUT_DIR / f"{key}.json").write_text(
            json.dumps(svg_text) + "\n", encoding="utf-8"
        )

    lines = [
        "/**",
        " * Auto-generated Gather artwork registry.",
        " *",
        " * Generated from scripts/gather-svg/*.svg by scripts/generate_gather_artwork_svgs.py.",
        " * Each artwork's SVG markup is its own JSON module in ./gatherArtworkSvg, loaded the",
        " * first time it is drawn, so importing this registry loads no artwork.",
        " */",
        "",
        "const GATHER_ARTWORK_LOADERS: Readonly<Record<string, () => string>> = {",
    ]

    for key, _ in entries:
        name = f"'{key}'" if re.search(r"[^A-Za-z0-9_$]", key) else key
        loader = f"require('./gatherArtworkSvg/{key}.json') as string,"
        line = f"  {name}: () => {loader}"
        if len(line) <= PRINT_WIDTH:
            lines.append(line)
        else:
            lines.append(f"  {name}: () =>")
            lines.append(f"    {loader}")

    lines += [
        "};",
        "",
        "const loadedGatherArtwork = new Map<string, string>();",
        "",
        "export function hasGatherArtwork(key: string): boolean {",
        "  return Object.prototype.hasOwnProperty.call(GATHER_ARTWORK_LOADERS, key);",
        "}",
        "",
        "export function getGatherArtworkXml(key: string): string | undefined {",
        "  const loader = hasGatherArtwork(key) ? GATHER_ARTWORK_LOADERS[key] : undefined;",
        "  if (!loader) {",
        "    return undefined;",
        "  }",
        "  let xml = loadedGatherArtwork.get(key);",
        "  if (xml === undefined) {",
        "    xml = loader();",
        "    loadedGatherArtwork.set(key, xml);",
        "  }",
        "  return xml;",
        "}",
        "",
    ]

    REGISTRY_OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    entries: list[tuple[str, str]] = []

    for key, stem in read_icon_registry_entries():
        source_svg = SOURCE_DIR / f"{stem}.svg"
        if not source_svg.exists():
            raise FileNotFoundError(f"Missing source SVG: {source_svg}")

        raw_svg_text = source_svg.read_text(encoding="utf-8")
        svg_text = build_bitmap_svg(raw_svg_text) or cleanup_svg(raw_svg_text)
        entries.append((key, svg_text))
        print(f"{key}: {source_svg.relative_to(ROOT)}")

    write_registry(entries)


if __name__ == "__main__":
    main()
