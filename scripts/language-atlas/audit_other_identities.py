#!/usr/bin/env python3
"""Audit identity collisions outside the Glottolog↔ROLV dialect-pair pass.

This is a read-only audit of the checked-in atlas inputs and current snapshot.
It deliberately does not alter importer code, generated snapshots, or source
records.  Exact provider identifiers are evidence; names, ISO parents,
countries, and coordinates are never sufficient for an automatic merge.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import itertools
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "data/language-atlas/sources"
ADMIN_ATLAS = ROOT / "apps/admin/data/language-atlas"

ROLV_URL = "https://globalrecordings.net/en/rolv"
GRN_URL = "https://globalrecordings.net/en/language/{code}"
EL_URL = "https://map.everylanguage.com/map/language/{entity_id}"
ISO_URL = "https://iso639-3.sil.org/code_tables/639/data"
GLOTTOLOG_URL = "https://glottolog.org/resource/languoid/id/{code}"

ISO_TYPES = {"iso-639-3", "iso639_3"}
NON_LANGUAGE_LEVELS = {"family", "mother_tongue"}


def load_json(path: Path) -> Any:
    data = path.read_bytes()
    if path.suffix == ".gz":
        data = gzip.decompress(data)
    return json.loads(data)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm_id(value: Any) -> str:
    text = str(value or "").strip()
    return text.zfill(5) if re.fullmatch(r"\d{1,5}", text) and int(text) else ""


def norm_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def table_rows(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and "headers" in value and "rows" in value:
        return [dict(zip(value["headers"], row)) for row in value["rows"]]
    return []


def unique_sorted(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


def pairwise_groups(groups: dict[str, set[str]]) -> Iterable[tuple[str, list[str]]]:
    for key, values in sorted(groups.items()):
        if len(values) > 1:
            yield key, sorted(values)


def evidence(source: str, *, url: str, fields: dict[str, Any]) -> dict[str, Any]:
    return {"source": source, "url": url, "fields": fields}


def candidate(
    candidate_id: str,
    family: str,
    subjects: list[dict[str, Any]],
    reason: str,
    evidence_rows: list[dict[str, Any]],
    confidence: str,
    disposition: str,
    *,
    current_output_ids: list[str] | None = None,
) -> dict[str, Any]:
    row = {
        "candidateId": candidate_id,
        "family": family,
        "subjects": subjects,
        "reason": reason,
        "evidence": evidence_rows,
        "confidence": confidence,
        "disposition": disposition,
    }
    if current_output_ids:
        row["currentOutputIds"] = sorted(set(current_output_ids))
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-json",
        default=str(ROOT / "docs/research/language-atlas/reconciliation-other-identities.json.gz"),
    )
    parser.add_argument(
        "--output-md",
        default=str(ROOT / "docs/research/language-atlas/reconciliation-other-identities.md"),
    )
    args = parser.parse_args()

    entity_path = SOURCES / "everylanguage-language-entities.json.gz"
    entity_source_path = SOURCES / "everylanguage-language-entity-sources.json.gz"
    stats_path = SOURCES / "everylanguage-language-stats.json.gz"
    rolv_current_path = SOURCES / "grn-rolv-codes-20260905.json"
    rolv_saved_path = SOURCES / "registry-rolv-local-20260822.json"
    rolv_changes_path = SOURCES / "grn-rolv-changes-20260905.json"
    rolv_alternate_path = SOURCES / "grn-rolv-alternate-names-20260905.json"
    map_index_path = SOURCES / "grn-mapapp-language-variety-index-20260905.json"
    workbook_path = SOURCES / "registry-workbook-data-20260822.json.gz"
    index_path = ADMIN_ATLAS / "index.json.gz"

    entity_rows = load_json(entity_path)
    all_entities = {row["id"]: row for row in entity_rows}
    entities = {row["id"]: row for row in entity_rows if not row.get("deleted_at")}
    source_rows = [
        row
        for row in load_json(entity_source_path)
        if not row.get("deleted_at") and row.get("language_entity_id") in entities
    ]
    stats_rows = {row["language_entity_id"]: row for row in load_json(stats_path)}
    source_by_entity: dict[str, dict[str, set[str]]] = collections.defaultdict(
        lambda: collections.defaultdict(set)
    )
    duplicate_source_rows: collections.Counter[tuple[str, str, str, str]] = collections.Counter()
    for row in source_rows:
        key = (
            row["language_entity_id"],
            text(row.get("source")),
            text(row.get("external_id_type")),
            text(row.get("external_id")),
        )
        duplicate_source_rows[key] += 1
        source_by_entity[row["language_entity_id"]][row["external_id_type"]].add(
            text(row.get("external_id"))
        )

    current_rows = load_json(rolv_current_path)["data"]["ROLVCodes"]
    saved_rows = load_json(rolv_saved_path)["data"]["ROLVCodes"]
    current_rolv = {norm_id(row["ROLVCode"]): row for row in current_rows}
    saved_rolv = {norm_id(row["ROLVCode"]): row for row in saved_rows}
    changes = load_json(rolv_changes_path)["data"]["ROLVChanges"]
    changes_by_code: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in changes:
        code = norm_id(row.get("ROLVCode"))
        if code:
            changes_by_code[code].append(row)
    alternate_rows = load_json(rolv_alternate_path)["data"]["ROLVAlternateNames"]
    map_rows = load_json(map_index_path)["rows"]

    # Current snapshot identity lookup.  Details preserve one Every Language
    # evidence row per source UUID, even when multiple UUIDs share one record.
    atlas_index = load_json(index_path)
    entity_to_output: dict[str, str] = {}
    output_to_entities: dict[str, list[str]] = collections.defaultdict(list)
    details_count = 0
    for detail_path in sorted(ADMIN_ATLAS.glob("details-*.json.gz")):
        for record_id, detail in load_json(detail_path).items():
            for row in detail.get("evidence", []):
                if row.get("label") == "Every Language entity" and row.get("value") in entities:
                    entity_id = row["value"]
                    entity_to_output[entity_id] = record_id
                    output_to_entities[record_id].append(entity_id)
                    details_count += 1
    for record_id in output_to_entities:
        output_to_entities[record_id] = sorted(set(output_to_entities[record_id]))

    # Whole-output key audit. This covers standalone ISO/Glottolog/ROLV
    # records as well as EL-backed records, so duplicate key counts are not
    # limited to the Every Language source namespace.
    current_records = atlas_index.get("records", [])

    def output_key_summary(records: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, list[str]]]:
        groups_by_field: dict[str, dict[str, list[str]]] = {}
        for field in ("iso6393", "glottocode", "rolvCode"):
            groups: dict[str, list[str]] = collections.defaultdict(list)
            for record in records:
                value = text(record.get(field))
                if value:
                    groups[value].append(record["id"])
            groups_by_field[field] = {
                value: sorted(ids) for value, ids in sorted(groups.items()) if len(ids) > 1
            }
        values_by_field = {
            field: {text(record.get(field)) for record in records if text(record.get(field))}
            for field in ("iso6393", "glottocode", "rolvCode")
        }
        namespace_collisions = {
            f"{first}↔{second}": sorted(values_by_field[first] & values_by_field[second])
            for first, second in (("iso6393", "glottocode"), ("iso6393", "rolvCode"), ("glottocode", "rolvCode"))
        }
        coverage = {
            field: {
                "uniqueKeys": len({text(record.get(field)) for record in records if text(record.get(field))}),
                "duplicateGroups": len(groups),
                "recordsInDuplicateGroups": sum(len(ids) for ids in groups.values()),
                "sampleGroups": dict(list(groups.items())[:8]),
            }
            for field, groups in groups_by_field.items()
        }
        return coverage, namespace_collisions

    output_key_coverage, output_namespace_collisions = output_key_summary(current_records)
    language_variety_records = [record for record in current_records if record.get("kind") in {"language", "dialect"}]
    language_variety_key_coverage, language_variety_namespace_collisions = output_key_summary(language_variety_records)

    # Helpers around the explicit Every Language hierarchy.
    parent_of = {entity_id: row.get("parent_id") for entity_id, row in entities.items()}
    iso_by_entity: dict[str, set[str]] = {}
    for entity_id in entities:
        iso_by_entity[entity_id] = {
            value
            for kind in ISO_TYPES
            for value in source_by_entity[entity_id].get(kind, set())
            if re.fullmatch(r"[a-z]{3}", value) and value != "xxx"
        }

    def parent_iso(entity_id: str) -> set[str]:
        seen: set[str] = set()
        parent = parent_of.get(entity_id)
        while parent and parent in entities and parent not in seen:
            seen.add(parent)
            if iso_by_entity[parent]:
                return set(iso_by_entity[parent])
            parent = parent_of.get(parent)
        return set()

    def is_ancestor(first: str, second: str) -> bool:
        """Whether first is an explicit ancestor of second."""
        seen: set[str] = set()
        parent = parent_of.get(second)
        while parent and parent in entities and parent not in seen:
            if parent == first:
                return True
            seen.add(parent)
            parent = parent_of.get(parent)
        return False

    def entity_subject(entity_id: str) -> dict[str, Any]:
        row = entities[entity_id]
        return {
            "id": f"el:{entity_id}",
            "sourceEntityId": entity_id,
            "name": row["name"],
            "level": row["level"],
            "parentEntityId": row.get("parent_id"),
            "iso6393": sorted(iso_by_entity[entity_id]),
            "currentOutputId": entity_to_output.get(entity_id),
        }

    def code_set(entity_id: str, kind: str) -> set[str]:
        return {
            code
            for value in source_by_entity[entity_id].get(kind, set())
            if (code := norm_id(value))
        }

    candidates: list[dict[str, Any]] = []
    explicit_identity_links: list[dict[str, Any]] = []
    retirement_replacement_links: list[dict[str, Any]] = []
    counts = collections.Counter()

    # A. Same-source EL language identity ambiguity.
    iso_groups: dict[str, set[str]] = collections.defaultdict(set)
    for entity_id, values in iso_by_entity.items():
        if entities[entity_id]["level"] in NON_LANGUAGE_LEVELS:
            continue
        for value in values:
            iso_groups[value].add(entity_id)
    name_groups: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for entity_id, row in entities.items():
        if row["level"] in NON_LANGUAGE_LEVELS:
            continue
        name_groups[(row["level"], norm_name(row["name"]))].add(entity_id)

    for iso, entity_ids in pairwise_groups(iso_groups):
        counts["el_iso_shared_groups"] += 1
        counts["el_iso_shared_entities"] += len(entity_ids)
        output_ids = [entity_to_output.get(entity_id, "") for entity_id in entity_ids]
        if len(set(output_ids)) == 1 and output_ids[0]:
            disposition = "already-reconciled-preserve-source-evidence"
            confidence = "high"
        else:
            disposition = "review-no-automatic-merge"
            confidence = "medium"
        ancestor_pairs = [
            [first, second]
            for first, second in itertools.combinations(entity_ids, 2)
            if is_ancestor(first, second) or is_ancestor(second, first)
        ]
        if ancestor_pairs:
            disposition = "preserve-parent-child"
            confidence = "high"
            reason = "Shared ISO appears in an explicit Every Language hierarchy; parent/child identity must remain separate."
        else:
            reason = "Shared ISO is an explicit parent-language identifier, but EL source UUIDs and names can represent varieties or source records."
        candidates.append(
            candidate(
                f"el-language-iso:{iso}:{'-'.join(entity_ids)}",
                "language-language-duplicate-id",
                [entity_subject(entity_id) for entity_id in entity_ids],
                reason,
                [
                    evidence(
                        "everylanguage",
                        url=EL_URL.format(entity_id=entity_ids[0]),
                        fields={"externalIdType": "iso-639-3", "iso6393": iso, "entityIds": entity_ids},
                    ),
                    evidence("iso-639-3", url=ISO_URL, fields={"code": iso}),
                ],
                confidence,
                disposition,
                current_output_ids=output_ids,
            )
        )

    for (level, name_key), entity_ids in pairwise_groups(name_groups):
        counts[f"el_exact_name_duplicate_{level}_groups"] += 1
        counts[f"el_exact_name_duplicate_{level}_entities"] += len(entity_ids)
        output_ids = [entity_to_output.get(entity_id, "") for entity_id in entity_ids]
        shared_iso = unique_sorted(
            value for entity_id in entity_ids for value in iso_by_entity[entity_id]
        )
        shared_grn = unique_sorted(
            value for entity_id in entity_ids for value in code_set(entity_id, "grn_language_id")
        )
        if len(set(output_ids)) == 1 and output_ids[0]:
            disposition = "already-reconciled-preserve-source-evidence"
            confidence = "high"
        elif shared_grn:
            disposition = "preserve-same-source-ambiguity"
            confidence = "medium"
        else:
            disposition = "review-no-automatic-merge"
            confidence = "low"
        reason = "Exact normalized name collision is a review signal only; source UUIDs, level, parentage, and provider identifiers remain authoritative."
        candidates.append(
            candidate(
                f"el-name:{level}:{name_key}:{'-'.join(entity_ids)}",
                "same-source-name-ambiguity",
                [entity_subject(entity_id) for entity_id in entity_ids],
                reason,
                [
                    evidence(
                        "everylanguage",
                        url=EL_URL.format(entity_id=entity_ids[0]),
                        fields={"normalizedName": name_key, "level": level, "entityIds": entity_ids},
                    )
                ],
                confidence,
                disposition,
                current_output_ids=output_ids,
            )
        )

    # B. EL dialects and explicit GRN/ROLV identity keys.  Only unresolved
    # current-output records become merge candidates; exact links already
    # collapsed by the importer are reported compactly as coverage.
    grn_to_entities: dict[str, set[str]] = collections.defaultdict(set)
    grn_to_all_entities: dict[str, set[str]] = collections.defaultdict(set)
    rolv_to_entities: dict[str, set[str]] = collections.defaultdict(set)
    for entity_id, row in entities.items():
        for code in code_set(entity_id, "grn_language_id"):
            grn_to_all_entities[code].add(entity_id)
        if row["level"] != "dialect":
            continue
        for code in code_set(entity_id, "grn_language_id"):
            grn_to_entities[code].add(entity_id)
        for code in code_set(entity_id, "rolv_code"):
            rolv_to_entities[code].add(entity_id)
        grn_codes = code_set(entity_id, "grn_language_id")
        rolv_codes = code_set(entity_id, "rolv_code")
        current_grn = sorted(grn_codes & set(current_rolv))
        current_rolv_codes = sorted(rolv_codes & set(current_rolv))
        historical_grn = sorted(grn_codes & (set(saved_rolv) | set(changes_by_code)) - set(current_rolv))
        output_id = entity_to_output.get(entity_id, "")
        if current_grn:
            counts["el_dialect_grn_current_entities"] += 1
        if current_rolv_codes:
            counts["el_dialect_rolv_current_entities"] += 1
        if historical_grn:
            counts["el_dialect_grn_historical_only_entities"] += 1
        if not output_id.startswith("el:"):
            continue
        if len(grn_codes) > 1 or len(rolv_codes) > 1:
            counts["el_dialect_multi_identifier_output_candidates"] += 1
            candidates.append(
                candidate(
                    f"el-dialect-multi-id:{entity_id}",
                    "el-dialect-rolv-grn-ambiguity",
                    [entity_subject(entity_id)],
                    "One EL dialect UUID carries multiple GRN or ROLV identifiers; no single canonical variety can be selected without provider confirmation.",
                    [
                        evidence(
                            "everylanguage",
                            url=EL_URL.format(entity_id=entity_id),
                            fields={
                                "grnLanguageIds": sorted(grn_codes),
                                "rolvCodes": sorted(rolv_codes),
                                "parentIso6393": sorted(parent_iso(entity_id)),
                            },
                        ),
                        evidence("global-recordings-rolv", url=ROLV_URL, fields={"currentCodes": sorted(set(current_grn + current_rolv_codes))}),
                    ],
                    "high" if current_grn or current_rolv_codes else "medium",
                    "preserve-same-source-ambiguity",
                    current_output_ids=[output_id],
                )
            )
        if historical_grn:
            counts["el_dialect_historical_id_output_candidates"] += 1
            for code in historical_grn:
                changes_for_code = changes_by_code.get(code, [])
                candidates.append(
                    candidate(
                        f"el-dialect-history:{entity_id}:{code}",
                        "grn-historical-vs-rolv",
                        [entity_subject(entity_id)],
                        "The EL dialect carries a GRN/ROLV code absent from the current code list but present in a saved or historical registry source; preserve the source record and do not map it to a current variety without an explicit replacement.",
                        [
                            evidence(
                                "everylanguage",
                                url=EL_URL.format(entity_id=entity_id),
                                fields={"grnLanguageId": code, "parentIso6393": sorted(parent_iso(entity_id))},
                            ),
                            evidence("grn-rolv-history", url=ROLV_URL, fields={"code": code, "changes": changes_for_code}),
                        ],
                        "high" if changes_for_code else "medium",
                        "preserve-retired-history",
                        current_output_ids=[output_id],
                    )
                )

    # Shared GRN identifiers across EL UUIDs are intentionally separate in the
    # current output when the crosswalk is ambiguous.  Keep these as compact
    # one-row candidates rather than pairwise name matches.
    for code, entity_ids in pairwise_groups(grn_to_all_entities):
        output_ids = sorted({entity_to_output.get(entity_id, "") for entity_id in entity_ids})
        counts["el_grn_shared_groups"] += 1
        counts["el_grn_shared_entities"] += len(entity_ids)
        if len(set(output_ids)) == 1 and output_ids[0]:
            disposition = "already-reconciled-preserve-source-evidence"
            confidence = "high"
        else:
            disposition = "preserve-same-source-ambiguity"
            confidence = "high"
        candidates.append(
            candidate(
                f"el-grn-shared:{code}:{'-'.join(sorted(entity_ids))}",
                "same-source-grn-ambiguity",
                [entity_subject(entity_id) for entity_id in sorted(entity_ids)],
                "A GRN language identifier is attached to more than one EL UUID. Shared GRN number alone cannot decide whether these are duplicate records, a parent/variety relationship, or a provider collision.",
                [
                    evidence(
                        "everylanguage",
                        url=EL_URL.format(entity_id=sorted(entity_ids)[0]),
                        fields={"grnLanguageId": code, "entityIds": sorted(entity_ids)},
                    ),
                    evidence("global-recordings-rolv", url=GRN_URL.format(code=code), fields={"grnLanguageNumber": code}),
                ],
                confidence,
                disposition,
                current_output_ids=output_ids,
            )
        )

    # C. Exact-name candidates between unresolved EL dialects and ROLV or
    # Glottolog are retained as weak leads.  We do not execute the separate
    # Glottolog↔ROLV dialect-pair audit here.
    rolv_name_groups: dict[str, set[str]] = collections.defaultdict(set)
    for code, row in current_rolv.items():
        rolv_name_groups[norm_name(row.get("VarietyName"))].add(code)
    workbook = load_json(workbook_path)
    glottolog_rows = table_rows(workbook.get("raw_glottolog_5_3"))
    glottolog_by_name_iso: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for row in glottolog_rows:
        if row.get("level") not in {"language", "dialect"}:
            continue
        for iso in re.findall(r"\b[a-z]{3}\b", text(row.get("iso639P3code"))):
            glottolog_by_name_iso[(norm_name(row.get("name")), iso)].add(row["id"])

    for entity_id, row in entities.items():
        if row["level"] != "dialect" or not entity_to_output.get(entity_id, "").startswith("el:"):
            continue
        name_key = norm_name(row["name"])
        if not name_key:
            continue
        parent_isos = parent_iso(entity_id) | iso_by_entity[entity_id]
        rolv_names = sorted(rolv_name_groups.get(name_key, set()))
        if rolv_names:
            counts["el_dialect_exact_name_rolv_leads"] += 1
            codes = [code for code in rolv_names if not parent_isos or current_rolv[code].get("LanguageCode") in parent_isos]
            if len(codes) == 1:
                candidates.append(
                    candidate(
                        f"el-rolv-name:{entity_id}:{codes[0]}",
                        "el-dialect-rolv-name-only",
                        [entity_subject(entity_id), {"id": f"rolv:{codes[0]}", "code": codes[0], "name": current_rolv[codes[0]].get("VarietyName"), "iso6393": current_rolv[codes[0]].get("LanguageCode")}],
                        "Exact normalized variety name and compatible ISO parent produce a lead, but no explicit EL ROLV/GRN identifier links the records.",
                        [
                            evidence("everylanguage", url=EL_URL.format(entity_id=entity_id), fields={"name": row["name"], "parentIso6393": sorted(parent_isos)}),
                            evidence("global-recordings-rolv", url=GRN_URL.format(code=codes[0]), fields={"rolvCode": codes[0], "varietyName": current_rolv[codes[0]].get("VarietyName"), "languageCode": current_rolv[codes[0]].get("LanguageCode")}),
                        ],
                        "low",
                        "review-primary-source-no-merge",
                        current_output_ids=[entity_to_output[entity_id], f"rolv:{codes[0]}"],
                    )
                )
        for iso in sorted(parent_isos):
            glottocodes = sorted(glottolog_by_name_iso.get((name_key, iso), set()))
            if not glottocodes:
                continue
            counts["el_dialect_exact_name_glottolog_leads"] += 1
            candidates.append(
                candidate(
                    f"el-glottolog-name:{entity_id}:{iso}:{'-'.join(glottocodes)}",
                    "el-dialect-glottolog-name-only",
                    [entity_subject(entity_id)] + [{"id": f"glottolog:{code}", "glottocode": code, "iso6393": iso} for code in glottocodes],
                    "Exact normalized name and ISO parent match a Glottolog node, but the EL snapshot has no Glottocode external identifier. This is a lead for review only and is excluded from the separate Glottolog↔ROLV dialect-pair audit.",
                    [
                        evidence("everylanguage", url=EL_URL.format(entity_id=entity_id), fields={"name": row["name"], "parentIso6393": sorted(parent_isos)}),
                        *[evidence("glottolog", url=GLOTTOLOG_URL.format(code=code), fields={"glottocode": code, "iso6393": iso}) for code in glottocodes],
                    ],
                    "low",
                    "review-primary-source-no-merge",
                    current_output_ids=[entity_to_output[entity_id]],
                )
            )

    # D. Historical ROLV coverage and code events.  Removed records are source
    # history, not replacements.  Change events are kept as compact candidates
    # only when they are relevant to an EL historical identifier or to current
    # output identity interpretation.
    removed_codes = sorted(set(saved_rolv) - set(current_rolv))
    counts["rolv_saved_rows"] = len(saved_rows)
    counts["rolv_current_rows"] = len(current_rows)
    counts["rolv_removed_codes"] = len(removed_codes)
    counts["rolv_added_codes"] = len(set(current_rolv) - set(saved_rolv))
    counts["rolv_changed_keys"] = sum(1 for old_code, old_row in saved_rolv.items() if old_code in current_rolv and old_row != current_rolv[old_code])
    counts["rolv_change_events"] = len(changes)
    counts["rolv_change_unique_codes"] = len(changes_by_code)
    counts["rolv_change_retired_events"] = sum(row.get("ChangeType") == "R" for row in changes)
    counts["rolv_change_codes_with_retirement"] = sum(any(row.get("ChangeType") == "R" for row in rows) for rows in changes_by_code.values())
    counts["grn_map_rows"] = len(map_rows)
    counts["grn_map_unique_source_ids"] = len({row.get("source_id") for row in map_rows})
    counts["rolv_alternate_name_rows"] = len(alternate_rows)
    counts["rolv_alternate_duplicate_rows"] = sum(count - 1 for count in collections.Counter((norm_id(row.get("ROLVCode")), text(row.get("LanguageTag")), norm_name(row.get("AlternateName"))) for row in alternate_rows).values() if count > 1)
    for code in removed_codes:
        old = saved_rolv[code]
        candidates.append(
            candidate(
                f"rolv-removed:{code}",
                "grn-historical-vs-rolv",
                [{"id": f"rolv:{code}", "code": code, "name": old.get("VarietyName"), "iso6393": old.get("LanguageCode"), "state": "saved-only"}],
                "The saved ROLV record is absent from the current code list and has no current replacement key in the retained delta; keep it as historical provenance.",
                [
                    evidence("grn-rolv-saved", url=ROLV_URL, fields={"rolvCode": code, "saved": old}),
                    evidence("grn-rolv-current", url=ROLV_URL, fields={"rolvCode": code, "present": False}),
                ],
                "high",
                "preserve-retired-history",
            )
        )

    # Explicit Jumeleli/Jumli trap required by the task.  Keep a dedicated
    # stable candidate even if future upstream snapshots change surrounding
    # names or aliases.
    jumleli = "18230236-977a-4f37-a433-fdcf36c72804"
    jumli = "809f4144-328b-44ba-8f5f-cf14c367665f"
    if jumleli in entities and jumli in entities:
        candidates.append(
            candidate(
                "el-jumleli-4160-parent-jumli-jml",
                "el-dialect-parent-child-trap",
                [entity_subject(jumleli), entity_subject(jumli), {"id": "rolv:04160", "code": "04160", "name": "Jumleli", "iso6393": "jml", "state": "historical"}],
                "GRN explicitly identifies 4160 as Jumleli under ISO parent Jumli jml; the current ROLV history marks 04160 retired and not a dialect. Synonym/alias overlap must never merge the dialect record into iso:jml.",
                [
                    evidence("everylanguage", url=EL_URL.format(entity_id=jumleli), fields={"entityId": jumleli, "parentEntityId": jumli, "grnLanguageId": "4160", "name": entities[jumleli]["name"]}),
                    evidence("global-recordings-grn", url=GRN_URL.format(code="4160"), fields={"grnLanguageNumber": "4160", "isoLanguageName": "Jumli", "iso6393": "jml", "languageName": "Jumleli", "relatedVarieties": ["Jumli: Asi", "Jumli: Chaudhabis", "Jumli: Paanchsai", "Jumli: Sinja"]}),
                    evidence("global-recordings-rolv-history", url=ROLV_URL, fields={"rolvCode": "04160", "changeTypes": [row for row in changes_by_code.get("04160", [])]}),
                ],
                "high",
                "preserve-parent-child-no-merge",
                current_output_ids=[entity_to_output.get(jumleli, ""), entity_to_output.get(jumli, ""), "rolv:026074", "rolv:026075", "rolv:026076", "rolv:026077"],
            )
        )

    # A GRN/ROLV code can have historical R events while the same numeric
    # code remains present in the current ROLV table. Treat this as identity
    # continuity only when the current row still has the EL dialect's parent
    # ISO. The one incompatible parent match is retained for review.
    for entity_id, row in sorted(entities.items()):
        if row["level"] != "dialect":
            continue
        parent_isos = parent_iso(entity_id)
        for code in sorted(code_set(entity_id, "grn_language_id") & set(current_rolv)):
            retirement_events = [
                event for event in changes_by_code.get(code, []) if event.get("ChangeType") == "R"
            ]
            if not retirement_events:
                continue
            current_row = current_rolv[code]
            rolv_parent = text(current_row.get("LanguageCode"))
            same_parent = bool(rolv_parent and rolv_parent in parent_isos)
            output_id = entity_to_output.get(entity_id, "")
            retirement_replacement_links.append(
                {
                    "linkId": f"el-grn-retirement-current:{entity_id}:{code}",
                    "sourceEntityId": entity_id,
                    "sourceName": row["name"],
                    "sourceLevel": row["level"],
                    "currentOutputId": output_id,
                    "grnLanguageId": code,
                    "currentRolvId": f"rolv:{code}",
                    "parentIso6393": sorted(parent_isos),
                    "currentRolvLanguageCode": rolv_parent,
                    "sameParentIso": same_parent,
                    "sameProviderKind": True,
                    "historicalRetirementEvents": retirement_events,
                    "reason": (
                        "The exact EL GRN identifier remains a current ROLV code despite historical retirement events; "
                        "the current ROLV row retains the same parent ISO and dialect-level provider kind."
                        if same_parent
                        else "The exact EL GRN identifier remains a current ROLV code, but the current ROLV row has a different "
                        "parent ISO from the EL hierarchy; do not canonicalize without provider confirmation."
                    ),
                    "confidence": "high" if same_parent else "medium",
                    "disposition": "canonical-current-rolv" if same_parent else "review-parent-context-no-merge",
                    "evidence": [
                        evidence(
                            "everylanguage",
                            url=EL_URL.format(entity_id=entity_id),
                            fields={
                                "entityId": entity_id,
                                "grnLanguageId": code,
                                "parentIso6393": sorted(parent_isos),
                                "level": row["level"],
                            },
                        ),
                        evidence(
                            "global-recordings-rolv",
                            url=GRN_URL.format(code=code),
                            fields={
                                "rolvCode": code,
                                "current": current_row,
                                "retirementEvents": retirement_events,
                            },
                        ),
                    ],
                }
            )
    counts["grn_current_codes_with_retirement_history"] = len(retirement_replacement_links)
    counts["grn_current_retirement_same_parent_canonical"] = sum(
        row["disposition"] == "canonical-current-rolv" for row in retirement_replacement_links
    )
    counts["grn_current_retirement_parent_mismatch_review"] = sum(
        row["disposition"] != "canonical-current-rolv" for row in retirement_replacement_links
    )

    # Build explicit identity-link coverage separately from review candidates.
    for code, entity_ids in sorted(rolv_to_entities.items()):
        if code not in current_rolv:
            continue
        explicit_identity_links.append({
            "linkId": f"el-rolv:{code}",
            "rolvCode": code,
            "entityIds": sorted(entity_ids),
            "outputIds": sorted({entity_to_output.get(entity_id, "") for entity_id in entity_ids}),
            "kind": "explicit-rolv",
            "confidence": "high" if len(entity_ids) == 1 else "medium",
            "disposition": "canonical-current-rolv" if len(entity_ids) == 1 else "preserve-same-source-ambiguity",
        })
    for code, entity_ids in sorted(grn_to_entities.items()):
        if code not in current_rolv:
            continue
        explicit_identity_links.append({
            "linkId": f"el-grn:{code}",
            "grnLanguageId": code,
            "entityIds": sorted(entity_ids),
            "outputIds": sorted({entity_to_output.get(entity_id, "") for entity_id in entity_ids}),
            "kind": "explicit-grn-current",
            "confidence": "high" if len(entity_ids) == 1 else "medium",
            "disposition": "canonical-current-rolv" if len(entity_ids) == 1 else "preserve-same-source-ambiguity",
        })

    # De-duplicate candidates by stable ID and ensure deterministic ordering.
    by_candidate_id = {row["candidateId"]: row for row in candidates}
    candidates = [by_candidate_id[key] for key in sorted(by_candidate_id)]
    disposition_counts = collections.Counter(row["disposition"] for row in candidates)
    family_counts = collections.Counter(row["family"] for row in candidates)
    output_state_counts = collections.Counter()
    for row in candidates:
        output_ids = row.get("currentOutputIds", [])
        if not output_ids:
            state = "historical-or-source-only"
        elif any(output_id.startswith("el:") for output_id in output_ids):
            state = "current-output-unresolved"
        else:
            state = "current-output-already-reconciled"
        output_state_counts[state] += 1
    level_counts = collections.Counter(row["level"] for row in entities.values())
    coverage = {
        "currentAtlas": {
            "records": atlas_index.get("counts", {}).get("records", len(atlas_index.get("records", []))),
            "languages": atlas_index.get("counts", {}).get("languages"),
            "dialects": atlas_index.get("counts", {}).get("dialects"),
            "languageVarieties": (atlas_index.get("counts", {}).get("languages") or 0) + (atlas_index.get("counts", {}).get("dialects") or 0),
            "peopleGroups": atlas_index.get("counts", {}).get("peopleGroups"),
            "recordsByKind": dict(sorted(collections.Counter(record.get("kind") for record in current_records).items())),
            "recordsByIdNamespace": dict(sorted(collections.Counter(record.get("id", "").split(":", 1)[0] for record in current_records).items())),
            "allRecordSourceKeyCoverage": output_key_coverage,
            "allRecordSourceNamespaceCollisions": output_namespace_collisions,
            "languageVarietySourceKeyCoverage": language_variety_key_coverage,
            "languageVarietySourceNamespaceCollisions": language_variety_namespace_collisions,
        },
        "everyLanguage": {
            "activeEntities": len(entities),
            "allSnapshotEntities": len(all_entities),
            "levels": dict(sorted(level_counts.items())),
            "activeExternalRows": len(source_rows),
            "activeExternalRowsWithExactDuplicateTuple": sum(count - 1 for count in duplicate_source_rows.values() if count > 1),
            "entitiesMappedToCurrentOutput": len(entity_to_output),
            "currentOutputRecordsReferenced": len(output_to_entities),
            "currentOutputRecordsWithMultipleELEntities": sum(len(ids) > 1 for ids in output_to_entities.values()),
            "currentOutputUnresolvedELRecords": sum(record_id.startswith("el:") for record_id in output_to_entities),
            "currentOutputResolvedNonELRecords": sum(
                record_id in output_to_entities and not record_id.startswith("el:")
                for record_id in output_to_entities
            ),
        },
        "glottolog": {
            "rawLanguageRows": sum(row.get("level") == "language" for row in glottolog_rows),
            "rawDialectRows": sum(row.get("level") == "dialect" for row in glottolog_rows),
            "includedOnlyForELNameLead": True,
            "separateGlottologRolvDialectPairAudit": "excluded",
        },
        "explicitLinks": {
            "rows": len(explicit_identity_links),
            "rolvCurrentLinks": sum(row["kind"] == "explicit-rolv" for row in explicit_identity_links),
            "grnCurrentLinks": sum(row["kind"] == "explicit-grn-current" for row in explicit_identity_links),
            "uniqueCurrentRolvCodesWithEL": len({row["rolvCode"] for row in explicit_identity_links if row["kind"] == "explicit-rolv"}),
            "uniqueCurrentGrnIdsWithEL": len({row["grnLanguageId"] for row in explicit_identity_links if row["kind"] == "explicit-grn-current"}),
        },
        "retirementContinuity": {
            "rows": len(retirement_replacement_links),
            "sameParentCanonicalRows": counts["grn_current_retirement_same_parent_canonical"],
            "parentMismatchReviewRows": counts["grn_current_retirement_parent_mismatch_review"],
        },
    }
    report = {
        "schemaVersion": 1,
        "audit": "reconciliation-other-identities",
        "generatedAt": "2026-09-07",
        "scope": {
            "included": [
                "Every Language language-language duplicate IDs and exact-name collisions",
                "Every Language dialects versus explicit current/historical GRN and ROLV identifiers",
                "GRN saved/current/change history versus ROLV current identity",
                "same-source duplicate ambiguities",
                "Every Language dialect exact-name leads to ROLV or Glottolog",
            ],
            "excluded": [
                "Glottolog-versus-ROLV dialect-pair identity audit (owned by another worker)",
                "name-only merges",
                "country, coordinates, shared ISO parent, or shared provider alias as automatic identity proof",
            ],
        },
        "inputs": {
            "everylanguageEntities": {"path": str(entity_path.relative_to(ROOT)), "sha256": sha256(entity_path), "rows": len(entity_rows)},
            "everylanguageEntitySources": {"path": str(entity_source_path.relative_to(ROOT)), "sha256": sha256(entity_source_path), "rows": len(source_rows)},
            "everylanguageStats": {"path": str(stats_path.relative_to(ROOT)), "sha256": sha256(stats_path), "rows": len(stats_rows)},
            "rolvCurrent": {"path": str(rolv_current_path.relative_to(ROOT)), "sha256": sha256(rolv_current_path), "rows": len(current_rows)},
            "rolvSaved": {"path": str(rolv_saved_path.relative_to(ROOT)), "sha256": sha256(rolv_saved_path), "rows": len(saved_rows)},
            "rolvChanges": {"path": str(rolv_changes_path.relative_to(ROOT)), "sha256": sha256(rolv_changes_path), "rows": len(changes)},
            "rolvAlternateNames": {"path": str(rolv_alternate_path.relative_to(ROOT)), "sha256": sha256(rolv_alternate_path), "rows": len(alternate_rows)},
            "grnMapIndex": {"path": str(map_index_path.relative_to(ROOT)), "sha256": sha256(map_index_path), "rows": len(map_rows)},
            "registryWorkbook": {"path": str(workbook_path.relative_to(ROOT)), "sha256": sha256(workbook_path)},
            "currentAdminIndex": {"path": str(index_path.relative_to(ROOT)), "sha256": sha256(index_path), "detailsEntityEvidenceRows": details_count},
        },
        "coverage": coverage,
        "counts": dict(sorted(counts.items())),
        "candidateCounts": {
            "total": len(candidates),
            "byFamily": dict(sorted(family_counts.items())),
            "byDisposition": dict(sorted(disposition_counts.items())),
            "byCurrentOutputState": dict(sorted(output_state_counts.items())),
        },
        "explicitIdentityLinks": explicit_identity_links,
        "retirementReplacementLinks": retirement_replacement_links,
        "candidates": candidates,
        "rules": [
            "Exact ROLV or GRN identifiers establish a current provider link only when unique and parent context does not conflict.",
            "A shared GRN identifier across EL UUIDs remains ambiguous even when names are similar.",
            "An EL dialect remains distinct from its ISO parent; a parent ISO, country, coordinate, or synonym does not merge it.",
            "ROLV current, saved, and change-list records are separate provenance layers; a retired code has no implicit replacement.",
            "Jumleli GRN 4160 under Jumli jml is a required parent-child no-merge trap.",
        ],
    }

    output_json = Path(args.output_json)
    output_md = Path(args.output_md)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    with output_json.open("wb") as output_file:
        with gzip.GzipFile(fileobj=output_file, mode="wb", compresslevel=9, mtime=0) as compressed:
            compressed.write(payload)

    sample_ids = [
        "el-jumleli-4160-parent-jumli-jml",
        "el-dialect-multi-id:",
        "el-grn-shared:",
        "el-dialect-history:",
        "el-rolv-name:",
        "el-glottolog-name:",
        "el-language-iso:",
        "el-name:",
    ]
    sample = []
    for prefix in sample_ids:
        if prefix.endswith(":"):
            match = next((row for row in candidates if row["candidateId"].startswith(prefix)), None)
        else:
            match = next((row for row in candidates if row["candidateId"] == prefix), None)
        if match and match not in sample:
            sample.append(match)
    lines = [
        "# Other identity reconciliation audit",
        "",
        "Generated 2026-09-07 from the checked-in source snapshots and current admin atlas index. This report is read-only audit output; it does not alter builders or generated snapshots.",
        "",
        "## Scope",
        "",
        "This pass covers Every Language language-language duplicate IDs and names, Every Language dialects against explicit GRN/ROLV identifiers, GRN saved/current/change history, and same-source ambiguities. The separate Glottolog-versus-ROLV dialect-pair audit is excluded. No merge is proposed from names, ISO parent, country, coordinates, or aliases alone.",
        "",
        "## Coverage",
        "",
        f"- Current atlas language varieties: **{coverage['currentAtlas']['languageVarieties']:,}** ({coverage['currentAtlas']['languages']:,} languages + {coverage['currentAtlas']['dialects']:,} dialects/varieties); total records **{coverage['currentAtlas']['records']:,}**.",
        f"- Every Language: **{coverage['everyLanguage']['activeEntities']:,}** active entities and **{coverage['everyLanguage']['activeExternalRows']:,}** active external-ID rows.",
        f"- Shared EL ISO groups: **{counts['el_iso_shared_groups']:,}** groups / **{counts['el_iso_shared_entities']:,}** entities; exact-name duplicate groups are tracked separately and are never auto-merged.",
        f"- Current ROLV: **{counts['rolv_current_rows']:,}** rows; saved ROLV: **{counts['rolv_saved_rows']:,}** rows; removed saved-only codes: **{counts['rolv_removed_codes']:,}**.",
        f"- GRN changes: **{counts['rolv_change_events']:,}** events over **{counts['rolv_change_unique_codes']:,}** codes, including **{counts['rolv_change_retired_events']:,}** retirement events.",
        f"- Explicit current EL links: **{len(explicit_identity_links):,}** compact rows; all candidate rows: **{len(candidates):,}**.",
        f"- Candidate output state: **{output_state_counts['current-output-unresolved']:,}** unresolved current-output rows, **{output_state_counts['current-output-already-reconciled']:,}** already reconciled current-output rows, and **{output_state_counts['historical-or-source-only']:,}** historical/source-only rows.",
        f"- Current EL GRN identifiers with historical R events: **{len(retirement_replacement_links):,}**; **{counts['grn_current_retirement_same_parent_canonical']:,}** retain the same parent ISO and are canonical-current-ROLV continuity links, while **{counts['grn_current_retirement_parent_mismatch_review']:,}** require review.",
        f"- Language/dialect duplicate keys: ISO-639-3 **{coverage['currentAtlas']['languageVarietySourceKeyCoverage']['iso6393']['duplicateGroups']:,}** groups / **{coverage['currentAtlas']['languageVarietySourceKeyCoverage']['iso6393']['recordsInDuplicateGroups']:,}** records, Glottocode **{coverage['currentAtlas']['languageVarietySourceKeyCoverage']['glottocode']['duplicateGroups']:,}**, ROLV **{coverage['currentAtlas']['languageVarietySourceKeyCoverage']['rolvCode']['duplicateGroups']:,}**; cross-namespace exact collisions: **{sum(len(values) for values in language_variety_namespace_collisions.values()):,}**.",
        f"- Full-output key audit including people groups: ISO-639-3 **{coverage['currentAtlas']['allRecordSourceKeyCoverage']['iso6393']['duplicateGroups']:,}** groups; this broader count is retained separately from the language/dialect metric.",
        "",
        "## Strongest decisions",
        "",
        "- Preserve the Jumleli EL UUID `el:18230236-977a-4f37-a433-fdcf36c72804` under parent `iso:jml` / EL parent UUID `809f4144-328b-44ba-8f5f-cf14c367665f`. GRN identifies language 4160 as Jumleli with ISO parent Jumli (`jml`), and ROLV history records `04160` as retired / not a dialect. This is a parent-child no-merge case.",
        "- Keep six EL dialect records whose GRN IDs are present only in the saved 2026-08-22 ROLV snapshot as historical source records; the current delta provides no replacement key.",
        "- Keep EL records with one UUID carrying multiple current GRN/ROLV identifiers and EL UUIDs sharing a GRN identifier as same-source ambiguities. These need provider confirmation before any merge or canonical reassignment.",
        "- No new merge proposal is made from the whole-output duplicate ISO groups: those groups include expected parent/variety and Scripture project records, while every ROLV and Glottocode key is unique in the output. Exact namespace links are retained as evidence.",
        "",
        "## Review candidate sample",
        "",
    ]
    for row in sample:
        lines.append(f"- `{row['candidateId']}` — {row['disposition']} ({row['confidence']}): {row['reason']}")
    lines.extend([
        "",
        "The machine-readable report contains every candidate ID, evidence fields, confidence, disposition, explicit current-link coverage, source hashes, and the excluded Glottolog↔ROLV scope.",
        "",
        "## Source anchors",
        "",
        f"- GRN ROLV documentation: {ROLV_URL}",
        f"- Official GRN Jumleli profile (language 4160): {GRN_URL.format(code='4160')}",
        f"- ISO 639-3 data: {ISO_URL}",
    ])
    output_md.write_text("\n".join(lines) + "\n")
    print(json.dumps({"outputJson": str(output_json), "outputMd": str(output_md), "coverage": coverage, "candidateCounts": report["candidateCounts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
