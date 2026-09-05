"""Publish only the reviewed map/search projection, never admin evidence shards."""
import argparse
import gzip
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "apps/admin/data/language-atlas/index.json.gz"
TARGET = ROOT / "apps/site/data/language-atlas/index.json.gz"
RECORD_FIELDS = "id kind name aliases iso6393 glottocode rolvCode parentId family countryCodes population scriptureStatus scriptureScope languageContextStatus sourceIds summary needsReview".split()
LOCATION_FIELDS = "sourceRecordId latitude longitude precision sourceId label countryCode".split()
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


def public_projection(index):
    records = []
    for record in index["records"]:
        public = pick(record, RECORD_FIELDS)
        public["location"] = pick(record["location"], LOCATION_FIELDS) if record.get("location") else None
        if "locations" in record:
            public["locations"] = [pick(point, LOCATION_FIELDS) for point in record["locations"]]
        records.append(public)
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    encoded, index = encoded_projection()
    if args.check:
        if not TARGET.exists() or TARGET.read_bytes() != encoded:
            raise SystemExit("Public atlas snapshot is stale; run build_public_atlas.py")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_bytes(encoded)
    print(f"Public atlas: {len(index['records']):,} records; {len(encoded):,} compressed bytes; {'verified' if args.check else 'written'}")


if __name__ == '__main__':
    main()
