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
SOURCE_DIR = ROOT / "assets" / "icons" / "gather-svg"
REGISTRY_OUTPUT_PATH = ROOT / "src" / "data" / "gatherArtwork.ts"


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
    lines = [
        "/**",
        " * Auto-generated Gather artwork registry.",
        " *",
        " * Generated from assets/icons/gather-svg/*.svg by scripts/generate_gather_artwork_svgs.py.",
        " */",
        "",
        "export const gatherArtworkXml: Record<string, string> = {",
    ]

    for key, svg_text in entries:
        lines.append(f"  {json.dumps(key)}: {json.dumps(svg_text)},")

    lines.append("};")
    lines.append("")
    lines.append(
        "export function hasGatherArtwork(key: string): key is keyof typeof gatherArtworkXml {"
    )
    lines.append("  return key in gatherArtworkXml;")
    lines.append("}")
    lines.append("")

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
