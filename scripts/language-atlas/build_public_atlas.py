"""Publish only the reviewed map/search projection, never admin evidence shards."""
import argparse
import gzip
import hashlib
import json
import math
import re
import subprocess
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/admin/data/language-atlas/index.json.gz"
TARGET = ROOT / "apps/site/data/language-atlas/index.json.gz"
RECORD_FIELDS = "id alternateIds kind name aliases iso6393 glottocode rolvCode parentId family countryCodes population scriptureStatus scriptureScope languageContextStatus sourceIds summary needsReview".split()
LOCATION_FIELDS = "sourceRecordId latitude longitude precision sourceId label countryCode".split()
SPOKEN_LOCATION_FIELDS = "label countryCode sourceId".split()
SOURCE_FIELDS = "id name url retrievedAt version license attribution note recordCount".split()
COUNT_FIELDS = "records languages dialects peopleGroups mapped approximate unmapped needsReview".split()
PUBLIC_NOTES = [
    "Counts are research registry records, not a definitive count of distinct living languages or translations available in the EveryBible app.",
    "Unknown Scripture availability is not evidence that no Scripture exists. Dialect coverage is not inferred from a parent language.",
    "Dots represent source reference locations. Parent-language and country placements are approximate, not settlement coordinates.",
    "Country associations and population figures are source-reported estimates.",
    "Data provided by Joshua Project. Republished with permission for noncommercial ministry research and education.",
    "Glottolog data: CC BY 4.0. GRN audio resources do not automatically establish availability of an audio Bible.",
]


def pick(value, fields):
    return {key: value[key] for key in fields if key in value}


# Every entry in a record's locations list is drawn as its own dot. Sources often
# place the same language a few metres (or a few km) apart, which made one
# record appear twice in a cluster, so the public map keeps the first point of
# any group closer than this. The admin index keeps every source placement.
COLOCATED_KM = 25


def distance_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a["latitude"], a["longitude"], b["latitude"], b["longitude"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(min(1.0, h)))


def distinct_places(points):
    kept = []
    for point in points:
        if all(distance_km(point, other) >= COLOCATED_KM for other in kept):
            kept.append(point)
    return kept


# Labels that name many unrelated varieties ("Kombio: East", "Aro: East") never
# count as the same place name.
GENERIC_LEAF_WORDS = {
    "east", "eastern", "west", "western", "north", "northern", "south", "southern",
    "central", "standard", "common", "nuclear", "cluster", "proper", "upper", "lower",
    "coastal", "high", "low", "highland", "lowland", "inner", "outer", "interior",
    "northeast", "northeastern", "northwest", "northwestern", "southeast", "southeastern",
    "southwest", "southwestern", "north-east", "north-west", "south-east", "south-west",
    "dialect", "language", "group", "i", "ii", "iii", "iv", "a", "b",
}


def place_name(record):
    """The variety's own label, without a "Language: " prefix, for spotting repeats."""
    name = record.get("name") or ""
    leaf = name.split(":", 1)[1] if ":" in name else name
    leaf = unicodedata.normalize("NFC", leaf).casefold()
    words = re.sub(r"[,()\-]", " ", leaf).split()
    if not words or all(word in GENERIC_LEAF_WORDS for word in words):
        return None
    return " ".join(words)


def retired_reference(record):
    """A retired ISO code kept only as a Glottolog reference row (e.g. Naxi nbf beside nxq)."""
    return record["kind"] == "language" and (
        record.get("family") == "Bookkeeping"
        or (bool(record.get("needsReview")) and set(record.get("sourceIds") or []) <= {"glottolog", "registry"})
    )


def hide_repeated_dots(records):
    """Draw one dot where sources list the same variety twice under different classifications.

    One source can call a variety a language and another its dialect, put it
    under a different parent, or keep a retired ISO code beside the current
    one, so the same name was drawn twice at one spot. Current languages always
    keep their dots; a dialect or retired reference row loses its dot (not its
    record) when a record with the same specific name already has a dot
    within ``COLOCATED_KM``.
    """
    def hideable(record):
        return record["kind"] == "dialect" or retired_reference(record)

    order = sorted(
        (record for record in records if record["kind"] in ("language", "dialect") and record.get("location")),
        key=lambda record: (hideable(record), record["kind"] != "language",
                            -len(record.get("sourceIds") or []), record["id"]),
    )
    drawn = {}
    for record in order:
        name = place_name(record)
        points = record.get("locations") or [record["location"]]
        if name is None:
            continue
        nearby = drawn.get(name, [])
        if hideable(record) and nearby and all(
            any(distance_km(point, other) < COLOCATED_KM for other in nearby) for point in points
        ):
            record["location"] = None
            record.pop("locations", None)
            continue
        drawn.setdefault(name, []).extend(points)


def public_projection(index):
    records = []
    for record in index["records"]:
        public = pick(record, RECORD_FIELDS)
        public["location"] = pick(record["location"], LOCATION_FIELDS) if record.get("location") else None
        if "locations" in record:
            public["locations"] = [pick(point, LOCATION_FIELDS) for point in distinct_places(record["locations"])]
        if "spokenLocations" in record:
            public["spokenLocations"] = [pick(point, SPOKEN_LOCATION_FIELDS) for point in record["spokenLocations"]]
        records.append(public)
    hide_repeated_dots(records)
    sources = []
    for source in index["sources"]:
        public = pick(source, SOURCE_FIELDS)
        if source["id"] == "registry":
            public["url"] = "https://everybible.app/#atlas-sources"
        parsed = urlparse(public["url"])
        if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f"Source {source['id']} requires a public HTTP(S) URL")
        # These notes describe the public release rather than the earlier internal import.
        if source["id"] == "everylanguage":
            public["license"] = "Owner-authorized publication; upstream terms retained"
        sources.append(public)
    return {
        "schemaVersion": index["schemaVersion"], "generatedAt": index["generatedAt"],
        "records": records, "countries": [pick(country, ("code", "name")) for country in index["countries"]],
        "counts": pick(index["counts"], COUNT_FIELDS), "sources": sources, "notes": PUBLIC_NOTES,
    }


def encoded_projection():
    with gzip.open(SOURCE, "rt") as source:
        index = public_projection(json.load(source))
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    # Fixed mtime and OS byte make builds identical across Python/platform versions.
    compressed = bytearray(gzip.compress(payload, mtime=0))
    compressed[9] = 255
    return bytes(compressed), index


# The generated one-line summary is ~30% of the decoded startup JSON, and the
# public map, search and profiles never display it. Language pages render their
# own copy server-side, so it stays in the compatibility snapshot only.
STARTUP_OMITTED_FIELDS = ("summary",)


def startup_projection(index):
    """Table encoding of every field the public map uses; every source placement stays local."""
    record_fields, location_fields, locations = [], [], []
    location_ids = {}

    def row(value, layouts):
        fields = sorted(value)
        if fields not in layouts:
            layouts.append(fields)
        return [layouts.index(fields), *[value[field] for field in fields]]

    def location_id(location):
        if location is None:
            return None
        key = json.dumps(location, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        if key not in location_ids:
            location_ids[key] = len(locations)
            locations.append(row(location, location_fields))
        return location_ids[key]

    records = []
    for record in index["records"]:
        if record["kind"] not in ("language", "dialect"):
            continue
        compact = {key: value for key, value in record.items() if key not in STARTUP_OMITTED_FIELDS}
        compact["location"] = location_id(record["location"])
        if "locations" in record:
            compact["locations"] = [location_id(location) for location in record["locations"]]
        records.append(row(compact, record_fields))
    return {
        **index, "schemaVersion": 2, "records": records,
        "recordFields": record_fields, "locationFields": location_fields, "locations": locations,
    }


def startup_artifacts(index):
    payload = json.dumps(startup_projection(index), ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    version = hashlib.sha256(payload).hexdigest()
    compressed = bytearray(gzip.compress(payload, mtime=0))
    compressed[9] = 255
    # Node's built-in Brotli keeps generation dependency-free alongside the site's runtime.
    brotli = subprocess.run([
        "node", "--input-type=commonjs", "-e",
        "const z=require('node:zlib');const fs=require('node:fs');process.stdout.write(z.brotliCompressSync(fs.readFileSync(0),{params:{[z.constants.BROTLI_PARAM_QUALITY]:9}}));",
    ], input=payload, stdout=subprocess.PIPE, check=True).stdout
    return {
        TARGET.parent / f"startup-{version}.json.gz": bytes(compressed),
        TARGET.parent / f"startup-{version}.json.br": brotli,
        ROOT / "apps/site/lib/public-atlas-version.json": (json.dumps({"version": version}, indent=2) + "\n").encode(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    encoded, index = encoded_projection()
    artifacts = {TARGET: encoded, **startup_artifacts(index)}
    if args.check:
        if any(not filename.exists() or filename.read_bytes() != content for filename, content in artifacts.items()):
            raise SystemExit("Public atlas snapshot is stale; run build_public_atlas.py")
    else:
        for filename, content in artifacts.items():
            filename.parent.mkdir(parents=True, exist_ok=True)
            filename.write_bytes(content)
    print(f"Public atlas: {len(index['records']):,} records; {len(encoded):,} compressed bytes; {'verified' if args.check else 'written'}")


if __name__ == '__main__':
    main()
