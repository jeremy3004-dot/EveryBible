#!/usr/bin/env python3
"""Refresh the internal Joshua Project source snapshot.

This script downloads only the public CSV exports listed on the Joshua Project
Datasets & API page. It never requests or stores an API key. The output keeps
raw source CSVs and a separate, source-ID-based atlas JSON; it does not infer
canonical ISO, Glottolog, or ROLV matches.
"""

from __future__ import annotations

import argparse
import csv
import email.utils
import gzip
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DATASETS = (
    ("pgic_all", 1, "joshua-project-pgic-all.csv"),
    ("countries_all", 4, "joshua-project-countries-all.csv"),
    ("people_country_language", 5, "joshua-project-people-country-language.csv"),
    ("languages_all", 6, "joshua-project-languages-all.csv"),
    ("field_definitions", 7, "joshua-project-field-definitions.csv"),
)
BASE_URL = "https://m.joshuaproject.net/resources/datasets/{}"
DATASETS_PAGE = "https://m.joshuaproject.net/resources/datasets"
API_DOCS = "https://api.joshuaproject.net/v1/docs/available_api_requests"
API_OPENAPI = "https://api.joshuaproject.net/api-docs.json"
TERMS_URL = "https://m.joshuaproject.net/help/terms"
DEFINITIONS_URL = "https://m.joshuaproject.net/help/definitions"
STATUS_LABELS = {
    "0": "Unspecified",
    "1": "Translation needed",
    "2": "Translation started",
    "3": "Portions",
    "4": "New Testament",
    "5": "Complete Bible",
}


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def as_int(value: str | None):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except ValueError:
        return value


def as_float(value: str | None):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return value


def as_text(value: str | None):
    return value if value not in (None, "") else None


def status_label(value: str | None):
    return STATUS_LABELS.get(value)


def read_rows(path: Path, valid: callable):
    """Read the CSV after its title/blank preamble and ignore its footer."""
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        next(reader, None)
        header = next(reader, None)
        rows = []
        for source_row, values in enumerate(reader, start=1):
            if len(values) != len(header):
                continue
            row = dict(zip(header, values))
            if valid(row):
                rows.append((source_row, row))
    return header, rows


def fetch(url: str, path: Path):
    """Fetch a public export with bounded retries and 429/5xx backoff."""
    for attempt in range(4):
        request = Request(url, headers={"User-Agent": "EveryBible internal research refresh"})
        try:
            with urlopen(request, timeout=120) as response:  # noqa: S310 - fixed HTTPS URLs above
                body = response.read()
                headers = {key.lower(): value for key, value in response.headers.items()}
                path.write_bytes(body)
                return headers
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
        except URLError:
            if attempt == 3:
                raise
        time.sleep(2**attempt)
    raise RuntimeError(f"failed to fetch {url}")


def fetched_at(headers: dict[str, str]) -> str:
    value = headers.get("date")
    if value:
        try:
            return email.utils.parsedate_to_datetime(value).astimezone(timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
        except (TypeError, ValueError, OverflowError):
            pass
    return now_utc()


def language_bio(row: dict[str, str]) -> str:
    name = row.get("Language") or row.get("ROL3") or "This language"
    rol3 = row.get("ROL3") or "unknown ROL3"
    state = {"L": "living", "N": "near-extinct"}.get(row.get("Status"))
    first = f"{name} is listed as a {state} language (ROL3 {rol3})" if state else f"{name} is listed under ROL3 {rol3}"
    pgics = as_int(row.get("NbrPGICs"))
    countries = as_int(row.get("NbrCountries"))
    if pgics is not None and countries is not None:
        relation = f"Joshua Project associates it with {pgics:,} people-group-in-country record{'s' if pgics != 1 else ''} in {countries:,} countr{'y' if countries == 1 else 'ies'}"
    elif pgics is not None:
        relation = f"Joshua Project reports {pgics:,} people-group-in-country record{'s' if pgics != 1 else ''}"
    elif countries is not None:
        relation = f"Joshua Project reports it in {countries:,} countr{'y' if countries == 1 else 'ies'}"
    else:
        relation = "the language-level export supplies no people-group or country count"
    code = row.get("BibleStatus")
    scripture = f"Bible status is {status_label(code) or 'unknown'}" if code else "Bible status is unspecified"
    year = row.get("BibleYear") or row.get("NTYear") or row.get("PortionsYear")
    if year:
        scripture += f" ({year})"
    resources = []
    if row.get("AudioRecordings") == "Y":
        resources.append("audio")
    if row.get("JF") == "Y":
        resources.append("Jesus Film")
    if resources:
        scripture += "; " + " and ".join(resources) + " listed as available"
    return first + ". " + relation + ". " + scripture + "."


def normalize_language(source_row: int, row: dict[str, str]) -> dict:
    return {
        "rol3": row["ROL3"],
        "name": as_text(row.get("Language")),
        "status": as_text(row.get("Status")),
        "bible_status": as_int(row.get("BibleStatus")),
        "bible_status_label": status_label(row.get("BibleStatus")),
        "bible_year": as_text(row.get("BibleYear")),
        "nt_year": as_text(row.get("NTYear")),
        "portions_year": as_text(row.get("PortionsYear")),
        "nbr_pgics": as_int(row.get("NbrPGICs")),
        "nbr_countries": as_int(row.get("NbrCountries")),
        "jesus_film": as_text(row.get("JF")),
        "audio_recordings": as_text(row.get("AudioRecordings")),
        "youversion_id": as_text(row.get("YouVersion_ID")),
        "derived_bio": language_bio(row),
        "source_file": "joshua-project-languages-all.csv",
        "source_row": source_row,
    }


def normalize_pgic(source_row: int, row: dict[str, str]) -> dict:
    return {
        "people_id3": row["PeopleID3"],
        "rog3": row["ROG3"],
        "country_name": as_text(row.get("Ctry")),
        "people_name_across_countries": as_text(row.get("PeopNameAcrossCountries")),
        "people_name_in_country": as_text(row.get("PeopNameInCountry")),
        "population": as_int(row.get("Population")),
        "jp_scale": as_int(row.get("JPScale")),
        "least_reached": as_text(row.get("LeastReached")),
        "frontier": as_text(row.get("Frontier")),
        "rol3": as_text(row.get("ROL3")),
        "primary_language_name": as_text(row.get("PrimaryLanguageName")),
        "bible_status": as_int(row.get("BibleStatus")),
        "bible_status_label": status_label(row.get("BibleStatus")),
        "primary_religion": as_text(row.get("PrimaryReligion")),
        "percent_adherents": as_float(row.get("PercentAdherents")),
        "percent_evangelical": as_float(row.get("PercentEvangelical")),
        "affinity_bloc": as_text(row.get("AffinityBloc")),
        "people_cluster": as_text(row.get("PeopleCluster")),
        "region_name": as_text(row.get("RegionName")),
        "continent": as_text(row.get("Continent")),
        "indigenous_code": as_text(row.get("IndigenousCode")),
        "workers_needed": as_int(row.get("WorkersNeeded")),
        "latitude": as_float(row.get("Latitude")),
        "longitude": as_float(row.get("Longitude")),
        "language_family": as_text(row.get("LanguageFamily")),
        "nomadic": as_text(row.get("Nomadic")),
        "source_file": "joshua-project-pgic-all.csv",
        "source_row": source_row,
    }


def normalize_link(source_row: int, row: dict[str, str]) -> dict:
    raw = row.get("ROL4") or ""
    return {
        "people_id3": row["PeopleID3"],
        "rog3": row["ROG3"],
        "rol3": row["ROL3"],
        "rol4_raw": as_int(raw),
        "rol4_code": raw.zfill(5) if raw not in ("", "0") and raw.isdigit() else None,
        "language": as_text(row.get("Language")),
        "language_dialect": as_text(row.get("LanguageDialect")),
        "language_rank": as_text(row.get("LanguageRank")),
        "speakers_world": as_int(row.get("Speakers")),
        "source_file": "joshua-project-people-country-language.csv",
        "source_row": source_row,
    }


def normalize_country(source_row: int, row: dict[str, str]) -> dict:
    return {
        "rog3": row["ROG3"],
        "iso2": as_text(row.get("ISO2")),
        "iso3": as_text(row.get("ISO3")),
        "country_name": as_text(row.get("Ctry")),
        "official_language_rol3": as_text(row.get("ROL3OfficialLanguage")),
        "official_language_name": as_text(row.get("OfficialLang")),
        "continent": as_text(row.get("Continent")),
        "region_name": as_text(row.get("RegionName")),
        "region_code": as_int(row.get("RegionCode")),
        "source_file": "joshua-project-countries-all.csv",
        "source_row": source_row,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    accessed_at = now_utc()
    raw = {}
    manifest_files = []

    for dataset_id, number, filename in DATASETS:
        path = output_dir / filename
        url = BASE_URL.format(number)
        headers = fetch(url, path)
        if dataset_id == "languages_all":
            valid = lambda row: bool(re.fullmatch(r"[A-Za-z0-9]{3}", row.get("ROL3", "")))
        elif dataset_id in ("pgic_all", "people_country_language"):
            valid = lambda row: row.get("PeopleID3", "").isdigit() and len(row.get("ROG3", "")) == 2
        elif dataset_id == "countries_all":
            valid = lambda row: len(row.get("ROG3", "")) == 2 and len(row.get("ISO3", "")) == 3
        else:
            valid = lambda row: row.get("TableName", "").startswith("jp")
        header, rows = read_rows(path, valid)
        raw[dataset_id] = (header, rows, path)
        physical_rows = max(0, len(path.read_text(encoding="utf-8-sig").splitlines()) - 3)
        manifest_files.append(
            {
                "id": dataset_id,
                "url": url,
                "file": filename,
                "content_disposition_filename": headers.get("content-disposition", "").split("filename=", 1)[-1] or None,
                "content_type": headers.get("content-type"),
                "retrieved_at": fetched_at(headers),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": path.stat().st_size,
                "source_rows_including_footer": physical_rows,
                "data_rows": len(rows),
                "columns": header,
            }
        )

    languages = [normalize_language(n, r) for n, r in raw["languages_all"][1]]
    pgic = [normalize_pgic(n, r) for n, r in raw["pgic_all"][1]]
    links = [normalize_link(n, r) for n, r in raw["people_country_language"][1] if len(r.get("ROL3", "")) == 3]
    countries = [normalize_country(n, r) for n, r in raw["countries_all"][1]]
    manifest = {
        "schema_version": 1,
        "provider": "Joshua Project",
        "scope": "Internal authenticated nonprofit ministry research snapshot; source records are preserved separately from canonical matches.",
        "accessed_at": accessed_at,
        "datasets_page": DATASETS_PAGE,
        "api_docs": API_DOCS,
        "api_openapi": API_OPENAPI,
        "terms_url": TERMS_URL,
        "definitions_url": DEFINITIONS_URL,
        "usage": {
            "attribution": "Data provided by Joshua Project",
            "attribution_url": "https://joshuaproject.net",
            "commercial_use": "prohibited by the Joshua Project Terms of Use",
            "public_replication": "prohibited; public presentations must add value and should not substantially reproduce Joshua Project data or service",
            "api": "documented REST API requires a free API key; no API key was obtained or stored for this snapshot",
        },
        "status_codes": STATUS_LABELS,
        "datasets": manifest_files,
        "counts": {
            "languages": len(languages),
            "pgic_rows": len(pgic),
            "people_language_rows": len(links),
            "countries": len(countries),
            "field_definition_rows": len(raw["field_definitions"][1]),
            "unique_people_id3": len({x["people_id3"] for x in pgic}),
            "unique_rol3_in_pgic": len({x["rol3"] for x in pgic}),
            "unique_rol3_in_languages": len({x["rol3"] for x in languages}),
            "unique_rol3_in_people_language": len({x["rol3"] for x in links}),
            "pgic_rows_with_coordinates": sum(x["latitude"] is not None and x["longitude"] is not None for x in pgic),
            "rol4_nonzero_rows": sum(x["rol4_code"] is not None for x in links),
        },
        "status_codes_note": "Use the explicit 0-5 table; some legacy field-description rows are truncated or stale.",
        "registry_codes": {
            "people_id3": "Joshua Project five digit people ID identifying one people group across countries; preserve as text.",
            "people_country_key": "PeopleID3 + ROG3 identifies a people group in a specific country.",
            "rog3": "Joshua Project / HIS two-letter FIPS country code; use country records to map to ISO2/ISO3.",
            "rol3": "Joshua Project / HIS three-letter language code described as ISO/Ethnologue; join on exact code only.",
            "rol4": "Joshua Project / HIS dialect code; current CSV exports integer-like values, so preserve raw and zero-padded text separately.",
        },
        "source_record_policy": "No inferred canonical ISO, Glottolog, or ROLV matches are embedded.",
    }
    (output_dir / "joshua-project-source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    snapshot = dict(manifest)
    snapshot["language_records"] = languages
    snapshot["people_group_country_records"] = pgic
    snapshot["people_language_records"] = links
    snapshot["country_records"] = countries
    payload = json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    with gzip.open(output_dir / "joshua-project-atlas.json.gz", "wb", compresslevel=9) as handle:
        handle.write(payload)
    print(json.dumps({"output_dir": str(output_dir), "counts": manifest["counts"]}, indent=2))


if __name__ == "__main__":
    main()
