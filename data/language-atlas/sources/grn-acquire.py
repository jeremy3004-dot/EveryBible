#!/usr/bin/env python3
"""Acquire reproducible GRN ROLV and MapApp source snapshots.

The fetched bodies are kept as returned by the public endpoints.  The optional
MapApp index is a derived convenience view; the GeoJSON remains the canonical
coordinate source and is never overwritten by the index.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request


GRAPHQL_URL = "https://gql.globalrecordings.net/graphql"
MAPAPP_GEOJSON_URL = (
    "https://gis.lightsys.org/server/rest/services/LanguageResources_v6/"
    "MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&"
    "outSR=4326&f=geojson"
)
ROLV_QUERIES = {
    "rolv-codes": "{ROLVCodes{LanguageCode,LanguageName,ROLVCode,LanguageTag,VarietyName,CountryCode,LocationName}}",
    "rolv-alternate-names": "{ROLVAlternateNames{ROLVCode,LanguageTag,AlternateName}}",
    "rolv-changes": "{ROLVChanges{ROLVCode,LanguageTag,Date,ChangeType,PrevLanguageCode,Explanation}}",
}


def fetch(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json, application/geo+json", "User-Agent": "EveryBible language atlas research"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
        if response.status != 200:
            raise RuntimeError(f"{url}: HTTP {response.status}")
        return body


def graphql(query: str, timeout: int) -> bytes:
    url = f"{GRAPHQL_URL}?{urllib.parse.urlencode({'query': query})}"
    return fetch(url, timeout)


def save(path: pathlib.Path, body: bytes) -> dict[str, object]:
    path.write_bytes(body)
    return {"path": path.name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def make_mapapp_index(body: bytes, current_codes: set[str]) -> dict[str, object]:
    source = json.loads(body)
    rows = []
    for feature in source.get("features", []):
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates")
        grn_number = props.get("grn_num")
        padded_number = str(grn_number).zfill(5) if grn_number is not None else None
        scope = props.get("scope")
        if scope == "Dialect" and padded_number in current_codes:
            match_basis = "rolv_code_exact"
            rolv_code = padded_number
        elif scope == "ISO_Lang" and props.get("iso"):
            match_basis = "iso639_3_language_area"
            rolv_code = None
        else:
            match_basis = "source_record_unmatched"
            rolv_code = None
        source_coordinates = None
        if geometry.get("type") == "Point" and isinstance(coordinates, list) and len(coordinates) >= 2:
            source_coordinates = {"longitude": coordinates[0], "latitude": coordinates[1]}
        attribute_coordinates = None
        if props.get("longitude") is not None and props.get("latitude") is not None:
            attribute_coordinates = {
                "longitude": props["longitude"],
                "latitude": props["latitude"],
            }
        rows.append(
            {
                "source_id": f"grnmapapp:LanguageResources_v6/MapServer/1:objectid:{props.get('objectid', feature.get('id'))}",
                "objectid": props.get("objectid", feature.get("id")),
                "iso639_3": props.get("iso"),
                "grn_language_number": grn_number,
                "scope": scope,
                "state": props.get("state"),
                "parent_grn_language_number": props.get("parent_num"),
                "rolv_code_exact": rolv_code,
                "match_basis": match_basis,
                "grn_name": props.get("grn_name"),
                "iso_language_name": props.get("iso_lang_name"),
                "location": props.get("location"),
                "source_coordinates": source_coordinates,
                "attribute_coordinates": attribute_coordinates,
            }
        )
    return {
        "source_url": MAPAPP_GEOJSON_URL,
        "source_layer": "LanguageResources_v6/MapServer/1 (Language Varieties)",
        "retrieved_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "match_policy": {
            "Dialect": "match grn_num to a five-digit current ROLV code only when exact",
            "ISO_Lang": "match by explicit ISO 639-3 code; grn_num is a GRN language number",
        },
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--date", help="UTC date used in output names (YYYYMMDD)")
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--index-only", action="store_true", help="Build the derived MapApp index from existing snapshots")
    args = parser.parse_args()
    stamp = args.date or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.index_only:
        map_body = (args.output_dir / f"grn-mapapp-language-varieties-{stamp}.geojson").read_bytes()
        current = json.loads((args.output_dir / f"grn-rolv-codes-{stamp}.json").read_bytes())
        current_codes = {str(row["ROLVCode"]).zfill(5) for row in current["data"]["ROLVCodes"]}
        index = make_mapapp_index(map_body, current_codes)
        index_path = args.output_dir / f"grn-mapapp-language-variety-index-{stamp}.json"
        index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(json.dumps({"date": stamp, "files": [index_path.name]}))
        return

    for stem, query in ROLV_QUERIES.items():
        save(args.output_dir / f"grn-{stem}-{stamp}.json", graphql(query, args.timeout))
    map_body = fetch(MAPAPP_GEOJSON_URL, args.timeout)
    save(args.output_dir / f"grn-mapapp-language-varieties-{stamp}.geojson", map_body)

    current = json.loads((args.output_dir / f"grn-rolv-codes-{stamp}.json").read_bytes())
    current_codes = {str(row["ROLVCode"]).zfill(5) for row in current["data"]["ROLVCodes"]}
    index = make_mapapp_index(map_body, current_codes)
    index_path = args.output_dir / f"grn-mapapp-language-variety-index-{stamp}.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"date": stamp, "files": sorted(p.name for p in args.output_dir.glob(f"*-{stamp}.*"))}))


if __name__ == "__main__":
    main()
