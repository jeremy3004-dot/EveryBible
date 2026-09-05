#!/usr/bin/env python3
"""Refresh the public Every Language map data snapshot.

The map uses a public Supabase project. This script performs read-only requests
using the public frontend key from EVERYLANGUAGE_PUBLIC_ANON_KEY, writes raw
JSON arrays as deterministic gzip files, and records request/range/schema
evidence in everylanguage-snapshot-manifest.json.

The output directory is explicit so a refresh can be staged in a temporary
directory before replacing a checked-in snapshot.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


BASE_URL = "https://mmcvtfxzntimcjfncdea.supabase.co"
KEY_ENV = "EVERYLANGUAGE_PUBLIC_ANON_KEY"
DEFAULT_PAGE_SIZE = 50_000
DEFAULT_MAX_PAGES = 10
DEFAULT_RETRIES = 3
DEFAULT_TIMEOUT = 90
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
CONTENT_RANGE_RE = re.compile(r"^(\d+)-(\d+)/(\d+|\*)$")


def spec(
    name: str,
    filename: str,
    method: str,
    path: str,
    expected_rows: int | None,
    fields: set[str],
    *,
    query: str | None = None,
    body: dict[str, Any] | None = None,
    note: str = "",
    paginate: bool = True,
    persist: bool = True,
) -> dict[str, Any]:
    return {
        "name": name,
        "filename": filename,
        "method": method,
        "path": path,
        "query": query,
        "body": body,
        "expected_rows": expected_rows,
        "fields": fields,
        "note": note,
        "paginate": paginate,
        "persist": persist,
    }


SPECS = [
    spec(
        "language_entities",
        "everylanguage-language-entities.json.gz",
        "GET",
        "/rest/v1/language_entities",
        35_348,
        {"id", "parent_id", "name", "level", "created_at", "updated_at", "deleted_at"},
        query="select=id,parent_id,name,level,created_at,updated_at,deleted_at&deleted_at=is.null&order=id.asc&limit={limit}&offset={offset}",
        note="Active language hierarchy rows.",
    ),
    spec(
        "language_entity_sources",
        "everylanguage-language-entity-sources.json.gz",
        "GET",
        "/rest/v1/language_entity_sources",
        70_280,
        {"language_entity_id", "external_id_type", "external_id", "source", "version", "is_external", "created_at", "deleted_at"},
        query="select=language_entity_id,external_id_type,external_id,source,version,is_external,created_at,deleted_at&deleted_at=is.null&is_external=eq.true&order=language_entity_id.asc&limit={limit}&offset={offset}",
        note="All active external source mappings; this is expected to require two pages.",
    ),
    spec(
        "language_stats",
        "everylanguage-language-stats.json.gz",
        "GET",
        "/rest/v1/language_stats",
        35_348,
        {
            "language_entity_id", "language_name", "iso639_3", "rolv_code", "bible_status",
            "has_full_audio_bible", "has_new_testament", "has_portions", "has_whole_bible",
            "has_audio_recordings", "has_audio_portions", "has_jesus_film", "population",
            "least_reached_population", "frontier_population", "people_group_count", "country_count",
            "hub_country", "jp_scale", "percent_christian", "percent_evangelical", "primary_religion",
            "religion_code", "least_reached", "status", "country_code", "translation_need_questionable",
            "bible_year", "nt_year", "portions_year", "fcbh_url", "jf_url", "grn_url", "nbr_pgics",
            "nbr_countries", "computed_at",
        },
        query="select=*&limit={limit}&offset={offset}",
        note="Computed aggregate language profiles.",
    ),
    spec(
        "language_coordinates",
        "everylanguage-language-coordinates.json.gz",
        "POST",
        "/rest/v1/rpc/get_all_language_coordinates",
        8_590,
        {
            "language_entity_id", "language_name", "region_id", "region_name", "longitude", "latitude",
            "location_source", "has_full_audio_bible", "has_audio_portions", "has_text_portions",
            "bible_status", "has_jesus_film", "iso639_3", "rolv_code", "bible_stats_computed_at",
        },
        body={"p_min_lng": -180, "p_min_lat": -90, "p_max_lng": 180, "p_max_lat": 90, "p_limit": 20_000, "p_location_source": None},
        note="Global map coordinate RPC; response is below its 20,000-row cap.",
        paginate=False,
    ),
    spec(
        "language_entities_regions",
        "everylanguage-language-entities-regions.json.gz",
        "GET",
        "/rest/v1/language_entities_regions",
        21_092,
        {"id", "language_entity_id", "region_id", "location", "location_source", "dominance_level", "created_at", "updated_at", "deleted_at"},
        query="select=id,language_entity_id,region_id,location,location_source,dominance_level,created_at,updated_at,deleted_at&deleted_at=is.null&order=language_entity_id.asc,dominance_level.desc&limit={limit}&offset={offset}",
        note="Active language-to-region links, including links without a point.",
    ),
    spec(
        "languages_regions_stats",
        "everylanguage-languages-regions-stats.json.gz",
        "GET",
        "/rest/v1/languages_regions_stats",
        21_088,
        {"bible_status", "language_entity_id", "people_group_count", "population", "region_id"},
        query="select=*&limit={limit}&offset={offset}",
        note="Language-by-region aggregate statistics.",
    ),
    spec(
        "languages_people_groups_stats",
        "everylanguage-languages-people-groups-stats.json.gz",
        "GET",
        "/rest/v1/languages_people_groups_stats",
        16_369,
        {"bible_status", "is_primary", "language_entity_id", "people_group_id", "population", "region_count"},
        query="select=*&limit={limit}&offset={offset}",
        note="Language-to-people-group aggregate links.",
    ),
    spec(
        "people_groups",
        "everylanguage-people-groups.json.gz",
        "GET",
        "/rest/v1/people_groups",
        10_404,
        {"id", "parent_id", "name", "people_id3", "population_pgac", "created_at", "updated_at", "deleted_at"},
        query="select=*&deleted_at=is.null&order=id.asc&limit={limit}&offset={offset}",
        note="Active canonical people-group rows.",
    ),
    spec(
        "people_groups_stats",
        "everylanguage-people-groups-stats.json.gz",
        "GET",
        "/rest/v1/people_groups_stats",
        10_404,
        {
            "affinity_bloc", "bible_status", "bible_year", "computed_at", "country_count", "frontier",
            "grn", "has_audio_recordings", "has_jesus_film", "image_url", "jf", "jpscale", "language_count",
            "least_reached", "name", "nt_year", "peop_name_across_countries", "peop_name_in_country",
            "people_cluster", "people_group_id", "people_id3", "percent_christian_pc", "percent_christian_pd",
            "percent_evangelical", "population", "portions_year", "primary_language_bible_status",
            "primary_language_has_new_testament", "primary_language_has_portions", "primary_language_has_whole_bible",
            "primary_language_name", "primary_language_rol3", "primary_religion", "rlg3",
        },
        query="select=*&order=people_group_id.asc&limit={limit}&offset={offset}",
        note="Computed aggregate people-group profiles.",
    ),
    spec(
        "people_groups_sources",
        "everylanguage-people-groups-sources.json.gz",
        "GET",
        "/rest/v1/people_groups_sources",
        26_773,
        {"people_group_id", "source", "version", "is_external", "external_id_type", "external_id", "created_at", "deleted_at"},
        query="select=people_group_id,source,version,is_external,external_id_type,external_id,created_at,deleted_at&deleted_at=is.null&is_external=eq.true&order=people_group_id.asc&limit={limit}&offset={offset}",
        note="Joshua Project external-ID crosswalk.",
    ),
    spec(
        "people_coordinates",
        "everylanguage-people-coordinates.json.gz",
        "POST",
        "/rest/v1/rpc/get_all_people_group_coordinates",
        16_368,
        {
            "people_group_id", "people_group_name", "region_id", "region_name", "longitude", "latitude",
            "peop_name_in_country", "population", "language_count", "country_count", "primary_language_rol3",
            "primary_language_name", "primary_language_bible_status", "image_url", "jpscale", "least_reached",
            "frontier", "primary_religion", "percent_evangelical", "percent_christian_pc", "bible_status",
            "has_audio_recordings", "has_jesus_film", "stats_computed_at",
        },
        body={"p_min_lng": -180, "p_min_lat": -90, "p_max_lng": 180, "p_max_lat": 90, "p_limit": 20_000, "p_location_source": None},
        note="Global people-group coordinate RPC; response is below its 20,000-row cap.",
        paginate=False,
    ),
    spec(
        "people_groups_regions",
        "everylanguage-people-groups-regions.json.gz",
        "GET",
        "/rest/v1/people_groups_regions",
        16_369,
        {
            "id", "people_group_id", "region_id", "population", "latitude", "longitude", "location_point",
            "peop_name_in_country", "primary_language_rol3", "people_id3_rog3", "created_at", "updated_at", "deleted_at",
        },
        query="select=*&deleted_at=is.null&order=people_group_id.asc,population.desc&limit={limit}&offset={offset}",
        note="Active people-group-to-region links and points.",
    ),
    spec(
        "regions",
        "everylanguage-regions.json.gz",
        "GET",
        "/rest/v1/regions",
        281,
        {"id", "parent_id", "name", "level", "bbox_min_lon", "bbox_min_lat", "bbox_max_lon", "bbox_max_lat", "center_lon", "center_lat", "created_at", "updated_at", "deleted_at"},
        query="select=id,parent_id,name,level,bbox_min_lon,bbox_min_lat,bbox_max_lon,bbox_max_lat,center_lon,center_lat,created_at,updated_at,deleted_at&deleted_at=is.null&order=level.asc,name.asc&limit={limit}&offset={offset}",
        note="Active continent, country, and world-region hierarchy.",
    ),
    spec(
        "region_stats",
        "everylanguage-region-stats.json.gz",
        "GET",
        "/rest/v1/region_stats",
        252,
        {
            "capital", "computed_at", "continent_code", "iso2", "iso3", "jp_country_name", "jp_region_name",
            "jpscale_ctry", "jpscale_image_url", "jpscale_text", "language_count", "languages_full_bible",
            "languages_new_testament", "languages_no_scripture", "languages_portions", "people_group_count",
            "percent_buddhism", "percent_christianity", "percent_ethnic_religions", "percent_hinduism",
            "percent_islam", "percent_non_religious", "percent_other_small", "population", "region_code",
            "region_id", "region_name", "religion_primary", "rlg3_primary", "rog3", "security_level", "window_status",
        },
        query="select=*&limit={limit}&offset={offset}",
        note="Country aggregate rows with explicit ISO2/ISO3 and provider codes.",
    ),
    spec(
        "countries_bible_status",
        "everylanguage-countries-bible-status.json.gz",
        "POST",
        "/rest/v1/rpc/get_countries_with_bible_status",
        242,
        {"region_id", "region_name", "boundary_simplified", "language_count", "languages_no_scripture", "languages_portions", "languages_new_testament", "languages_full_bible", "bible_status_score"},
        body={},
        note="Country boundaries and map Bible-status aggregates.",
        paginate=False,
    ),
    spec(
        "global_translation_statistics",
        "everylanguage-global-translation-statistics.json.gz",
        "GET",
        "/rest/v1/global_translation_statistics",
        1,
        {"total_languages", "full_audio_bible_count", "full_audio_bible_percentage", "audio_portions_count", "audio_portions_percentage", "text_portions_count", "text_portions_percentage", "active_projects_total", "completed_projects_total", "total_chapters_completed", "generated_at"},
        query="select=*&limit={limit}&offset={offset}",
        note="One-row map dashboard totals.",
        paginate=False,
    ),
    spec(
        "active_projects",
        "everylanguage-active-projects.json.gz",
        "POST",
        "/rest/v1/rpc/get_active_projects_with_progress",
        9,
        {"project_id", "project_name", "language_name", "has_audio", "has_text", "completed_chapters", "total_chapters", "progress_percentage"},
        body={},
        note="Active project progress rows used by the map dashboard.",
        paginate=False,
    ),
    spec(
        "projects_for_active_links",
        "",
        "GET",
        "/rest/v1/projects",
        11,
        {"id", "name", "region_id", "target_language_entity_id", "location", "created_at", "updated_at", "deleted_at"},
        query="select=id,name,region_id,target_language_entity_id,location,created_at,updated_at,deleted_at&deleted_at=is.null&limit={limit}&offset={offset}",
        note="Safe project fields kept in memory to make exact active project links; not persisted separately.",
        paginate=True,
        persist=False,
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for gzip snapshots and manifest.")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="Rows per table request (1–50000; default: 50000).")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help="Maximum pages per table (default: 10).")
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES, help="Retries for 429/5xx responses (default: 3).")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="HTTP timeout in seconds per request (default: 90).")
    parser.add_argument("--strict-current-counts", action="store_true", help="Fail if a row count differs from the 2026-09-05 observed count.")
    return parser.parse_args()


def parse_content_range(value: str | None) -> tuple[int, int, int | None] | None:
    if not value:
        return None
    match = CONTENT_RANGE_RE.match(value.strip())
    if not match:
        raise RuntimeError(f"Unexpected Content-Range header: {value!r}")
    total = None if match.group(3) == "*" else int(match.group(3))
    return int(match.group(1)), int(match.group(2)), total


def request_json(
    *,
    url: str,
    method: str,
    key: str,
    body: dict[str, Any] | None,
    retries: int,
    timeout: int,
    prefer_count: bool = False,
) -> tuple[Any, dict[str, Any]]:
    headers = {
        "Accept": "application/json",
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if prefer_count:
        headers["Prefer"] = "count=exact"
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
                response_headers = {k.lower(): v for k, v in response.headers.items()}
                status = int(response.status)
        except urllib.error.HTTPError as error:
            raw = error.read()
            response_headers = {k.lower(): v for k, v in error.headers.items()}
            status = int(error.code)
            if status not in RETRYABLE_STATUS or attempt >= retries:
                detail = raw[:240].decode("utf-8", "replace").replace("\n", " ")
                raise RuntimeError(f"{method} {url} returned HTTP {status}: {detail}") from error
        except urllib.error.URLError as error:
            if attempt >= retries:
                raise RuntimeError(f"{method} {url} failed: {error.reason}") from error
            time.sleep(min(30.0, 2.0**attempt))
            continue
        if status in RETRYABLE_STATUS:
            retry_after = response_headers.get("retry-after", "")
            try:
                delay = min(30.0, max(1.0, float(retry_after)))
            except ValueError:
                delay = min(30.0, 2.0**attempt)
            time.sleep(delay)
            continue
        if response_headers.get("content-encoding", "").lower() == "gzip":
            raw = gzip.decompress(raw)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"{method} {url} returned invalid JSON") from error
        return payload, {
            "status": status,
            "date": response_headers.get("date"),
            "content_range": response_headers.get("content-range"),
            "content_type": response_headers.get("content-type"),
        }
    raise RuntimeError(f"{method} {url} failed after retries")


def validate_rows(rows: Any, required_fields: set[str], label: str) -> tuple[list[dict[str, Any]], list[str]]:
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError(f"{label} did not return a JSON array of objects")
    if not rows:
        raise RuntimeError(f"{label} returned no rows; expected a populated public response")
    observed = set(rows[0])
    missing = sorted(required_fields - observed)
    if missing:
        raise RuntimeError(f"{label} schema is missing fields: {', '.join(missing)}")
    for index, row in enumerate(rows):
        if set(row) != observed:
            raise RuntimeError(f"{label} row {index} has a different field set")
    return rows, sorted(observed)


def make_url(specification: dict[str, Any], *, page_size: int, offset: int) -> str:
    path = BASE_URL + specification["path"]
    query = specification.get("query")
    if query:
        query = query.format(limit=page_size, offset=offset)
        return f"{path}?{query}"
    return path


def count_check(
    *,
    label: str,
    observed: int,
    expected: int | None,
    strict: bool,
) -> str | None:
    if expected is None or observed == expected:
        return None
    warning = f"observed {observed} rows; 2026-09-05 reference was {expected}"
    if strict:
        raise RuntimeError(f"{label} count drift: {warning}")
    print(f"warning: {label} count drift: {warning}", file=sys.stderr)
    return warning


def fetch_table(
    specification: dict[str, Any],
    *,
    key: str,
    page_size: int,
    max_pages: int,
    retries: int,
    timeout: int,
    strict_counts: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    offset = 0
    while True:
        if len(pages) >= max_pages:
            raise RuntimeError(f"{specification['name']} exceeded --max-pages={max_pages}")
        url = make_url(specification, page_size=page_size, offset=offset)
        payload, response = request_json(
            url=url,
            method="GET",
            key=key,
            body=None,
            retries=retries,
            timeout=timeout,
            prefer_count=True,
        )
        page_rows, _ = validate_rows(payload, specification["fields"], specification["name"])
        content_range = parse_content_range(response.get("content_range"))
        if content_range:
            start, end, total = content_range
            if start != offset or end - start + 1 != len(page_rows):
                raise RuntimeError(f"{specification['name']} Content-Range does not match its page")
            if total is not None and total < end + 1:
                raise RuntimeError(f"{specification['name']} Content-Range total is smaller than its page")
        pages.append({**response, "url": url})
        rows.extend(page_rows)
        offset += len(page_rows)
        if not specification["paginate"]:
            break
        if content_range and content_range[2] is not None and offset >= content_range[2]:
            break
        if len(page_rows) < page_size:
            break
    warning = count_check(label=specification["name"], observed=len(rows), expected=specification["expected_rows"], strict=strict_counts)
    return rows, {"pages": pages, "count_warning": warning}


def fetch_rpc(
    specification: dict[str, Any],
    *,
    key: str,
    retries: int,
    timeout: int,
    strict_counts: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    url = make_url(specification, page_size=DEFAULT_PAGE_SIZE, offset=0)
    payload, response = request_json(url=url, method="POST", key=key, body=specification["body"], retries=retries, timeout=timeout)
    rows, _ = validate_rows(payload, specification["fields"], specification["name"])
    content_range = parse_content_range(response.get("content_range"))
    if content_range:
        start, end, total = content_range
        if start != 0 or end - start + 1 != len(rows):
            raise RuntimeError(f"{specification['name']} Content-Range does not match the response")
        if total is not None and total != len(rows):
            raise RuntimeError(f"{specification['name']} reported {total} rows but returned {len(rows)}")
    p_limit = (specification.get("body") or {}).get("p_limit")
    if p_limit is not None and len(rows) >= p_limit:
        raise RuntimeError(f"{specification['name']} reached its p_limit={p_limit}; response may be truncated")
    warning = count_check(label=specification["name"], observed=len(rows), expected=specification["expected_rows"], strict=strict_counts)
    return rows, {"pages": [{**response, "url": url}], "count_warning": warning}


def deterministic_gzip(raw: bytes) -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as stream:
        stream.write(raw)
    return output.getvalue()


def write_snapshot(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    raw = (json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    compressed = deterministic_gzip(raw)
    path.write_bytes(compressed)
    return {
        "rows": len(rows),
        "fields": sorted(rows[0]) if rows else [],
        "uncompressed_bytes": len(raw),
        "compressed_bytes": len(compressed),
        "sha256_gzip": hashlib.sha256(compressed).hexdigest(),
    }


def normalize_active_project_links(
    active: list[dict[str, Any]], projects: list[dict[str, Any]], output_path: Path
) -> dict[str, Any]:
    by_id = {str(project["id"]): project for project in projects}
    if len(by_id) != len(projects):
        raise RuntimeError("projects response contains duplicate IDs")
    links = []
    for progress in active:
        project = by_id.get(str(progress["project_id"]))
        if project is None:
            raise RuntimeError(f"active project {progress['project_id']} is absent from projects")
        links.append(
            {
                "project_id": progress["project_id"],
                "project_name": progress["project_name"],
                "language_name": progress["language_name"],
                "target_language_entity_id": project["target_language_entity_id"],
                "region_id": project["region_id"],
                "location": project["location"],
                "has_audio": progress["has_audio"],
                "has_text": progress["has_text"],
                "completed_chapters": progress["completed_chapters"],
                "total_chapters": progress["total_chapters"],
                "progress_percentage": progress["progress_percentage"],
            }
        )
    return write_snapshot(output_path, links) | {
        "rows": len(links),
        "source_files": ["everylanguage-active-projects.json.gz"],
        "kind": "normalized_project_link",
    }


def main() -> int:
    args = parse_args()
    if not 1 <= args.page_size <= DEFAULT_PAGE_SIZE:
        raise SystemExit("--page-size must be between 1 and 50000")
    if args.max_pages < 1 or args.retries < 0 or args.timeout < 1:
        raise SystemExit("--max-pages must be positive; --retries must be non-negative; --timeout must be positive")
    key = os.environ.get(KEY_ENV)
    if not key:
        raise SystemExit(f"Set {KEY_ENV} to the public frontend anon key before refreshing")
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "dataset": "Every Language global Bible translation map public data snapshot",
        "retrieved_on_utc": dt.datetime.now(dt.timezone.utc).date().isoformat(),
        "api": {
            "base": BASE_URL,
            "auth_env": KEY_ENV,
            "auth_header_persisted": False,
            "transport": "Public Supabase PostgREST tables and RPCs used by map.everylanguage.com/map",
        },
        "files": [],
    }
    fetched: dict[str, list[dict[str, Any]]] = {}
    for specification in SPECS:
        if specification["method"] == "POST":
            rows, request_meta = fetch_rpc(
                specification,
                key=key,
                retries=args.retries,
                timeout=args.timeout,
                strict_counts=args.strict_current_counts,
            )
        else:
            rows, request_meta = fetch_table(
                specification,
                key=key,
                page_size=args.page_size,
                max_pages=args.max_pages,
                retries=args.retries,
                timeout=args.timeout,
                strict_counts=args.strict_current_counts,
            )
        fetched[specification["name"]] = rows
        if not specification["persist"]:
            continue
        path = output_dir / specification["filename"]
        details = write_snapshot(path, rows)
        entry = {
            "path": specification["filename"],
            "kind": "raw_response_array",
            "method": specification["method"],
            "url": make_url(specification, page_size=args.page_size, offset=0),
            "body": specification["body"],
            "expected_rows_reference": specification["expected_rows"],
            "raw_elements_preserved": True,
            "note": specification["note"],
            **request_meta,
            **details,
        }
        manifest["files"].append(entry)

    links_path = output_dir / "everylanguage-active-project-links.json.gz"
    links_details = normalize_active_project_links(fetched["active_projects"], fetched["projects_for_active_links"], links_path)
    manifest["files"].append(
        {
            "path": links_path.name,
            "method": "derived from GET + POST",
            "url": f"{BASE_URL}/rest/v1/projects?select=id,name,region_id,target_language_entity_id,location,created_at,updated_at,deleted_at&deleted_at=is.null&limit={args.page_size}&offset=0 plus {BASE_URL}/rest/v1/rpc/get_active_projects_with_progress",
            "body": {},
            "expected_rows_reference": 9,
            "source_urls": [
                make_url(SPECS[-1], page_size=args.page_size, offset=0),
                make_url(next(item for item in SPECS if item["name"] == "active_projects"), page_size=args.page_size, offset=0),
            ],
            "source_files": ["everylanguage-active-projects.json.gz"],
            "note": "Exact project_id join adds target_language_entity_id, region_id, and location; no name-based merge.",
            **links_details,
        }
    )
    manifest["files"] = sorted(manifest["files"], key=lambda entry: entry["path"])
    manifest_path = output_dir / "everylanguage-snapshot-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(manifest['files'])} snapshots to {output_dir}")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
