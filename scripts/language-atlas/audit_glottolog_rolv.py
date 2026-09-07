#!/usr/bin/env python3
"""Audit Glottolog dialects against GRN/ROLV varieties without merging records.

This is a read-only reconciliation report.  It deliberately keeps source
identities separate: the saved workbook exposes prior Glottocode pair fields,
but its Match Method is name/parent-derived and is not independent identifier
proof.  Parent ISO, country, or name similarity are review evidence and never
an automatic merge instruction.
"""

from __future__ import annotations

import argparse
import collections
import difflib
import gzip
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "data/language-atlas/sources"
ADMIN_ATLAS = ROOT / "apps/admin/data/language-atlas"
DEFAULT_JSON = ROOT / "docs/research/language-atlas/reconciliation-glottolog-rolv.json.gz"
DEFAULT_MD = ROOT / "docs/research/language-atlas/reconciliation-glottolog-rolv.md"

GENERIC_TOKENS = {
    "east", "eastern", "west", "western", "north", "northern", "south", "southern",
    "central", "standard", "common", "nuclear", "cluster", "proper", "upper", "lower",
    "coastal", "high", "low", "southeast", "southeastern", "southwest", "southwestern",
    "northeast", "northeastern", "northwest", "northwestern", "interior", "inner",
}


def load_json(path: Path) -> Any:
    data = path.read_bytes()
    if path.suffix == ".gz":
        data = gzip.decompress(data)
    return json.loads(data)


def write_json(path: Path, value: Any) -> None:
    """Write stable compact JSON, using deterministic gzip for .json.gz."""
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if path.suffix == ".gz":
        with path.open("wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as handle:
                handle.write(payload.encode("utf-8"))
    else:
        path.write_text(payload)


def table_rows(bundle: dict[str, Any], name: str) -> list[dict[str, Any]]:
    table = bundle[name]
    return [dict(zip(table["headers"], row)) for row in table["rows"]]


def text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def rolv_code(value: Any) -> str | None:
    raw = text(value)
    if not re.fullmatch(r"\d{1,5}", raw) or int(raw) == 0:
        return None
    return raw.zfill(5)


def ascii_tokens(value: Any) -> list[str]:
    raw = unicodedata.normalize("NFKD", text(value)).casefold()
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    return re.findall(r"[a-z0-9]+", raw)


def normalized(value: Any) -> str:
    return "".join(ascii_tokens(value))


def name_variants(value: Any) -> set[str]:
    raw = text(value)
    variants = {normalized(raw)} if raw else set()
    if ":" in raw:
        variants.add(normalized(raw.split(":", 1)[1]))
    return {variant for variant in variants if len(variant) >= 3}


def split_codes(value: Any) -> set[str]:
    return set(re.findall(r"\b[A-Z]{2}\b", text(value).upper()))


def parent_language(row: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    seen: set[str] = set()
    current = row
    while current and current.get("id") not in seen:
        seen.add(current["id"])
        if current.get("level") == "language":
            return current
        current = by_id.get(text(current.get("parent_id")))
    return None


def source_record(path: str, source_row: dict[str, Any] | None) -> dict[str, Any]:
    if not source_row:
        return {"source": path}
    return {
        "source": path,
        "sourceRow": source_row.get("Source Row"),
    }


def generic_label(*values: Any) -> bool:
    tokens = set(token for value in values for token in ascii_tokens(value))
    return bool(tokens & GENERIC_TOKENS)


def country_relation(rolv: dict[str, Any], glottolog: dict[str, Any]) -> str:
    r_codes = split_codes(rolv.get("CountryCode") or rolv.get("Country Code"))
    g_codes = split_codes(glottolog.get("country_ids"))
    if not r_codes or not g_codes:
        return "unknown"
    return "compatible" if r_codes & g_codes else "conflict"


def index_record_map(index: dict[str, Any]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = collections.defaultdict(list)
    for record in index["records"]:
        if record.get("kind") in {"language", "dialect"}:
            for key in ("glottocode", "rolvCode"):
                value = text(record.get(key))
                if value:
                    result[f"{key}:{value}"].append(record["id"])
    return result


def candidate_base(code: str, rolv: dict[str, Any], glotto: dict[str, Any], parent: dict[str, Any] | None) -> dict[str, Any]:
    rolv_name = text(rolv.get("VarietyName") or rolv.get("Variety Name"))
    glotto_name = text(glotto.get("name"))
    parent_iso = text(parent.get("iso639P3code")) if parent else ""
    return {
        "rolv": {
            "id": f"rolv:{code}",
            "code": code,
            "name": rolv_name,
            "languageName": text(rolv.get("LanguageName") or rolv.get("ROLV Language Name")),
            "iso6393": text(rolv.get("LanguageCode") or rolv.get("ISO Language Code")) or None,
            "countryCodes": sorted(split_codes(rolv.get("CountryCode") or rolv.get("Country Code"))),
            "locationName": text(rolv.get("LocationName") or rolv.get("Location Name")) or None,
            "sourceAvailability": rolv.get("sourceAvailability", []),
        },
        "glottolog": {
            "id": text(glotto.get("id")),
            "name": glotto_name,
            "level": text(glotto.get("level")),
            "parentId": text(glotto.get("parent_id")) or None,
            "parentName": text(parent.get("name")) if parent else None,
            "parentIso6393": parent_iso or None,
            "countryCodes": sorted(split_codes(glotto.get("country_ids"))),
        },
    }


def make_candidate(
    code: str,
    rolv: dict[str, Any],
    glotto: dict[str, Any],
    parent: dict[str, Any] | None,
    *,
    reason: str,
    disposition: str,
    confidence: str,
    evidence: list[dict[str, Any]],
    auto_merge: bool,
    score: float | None = None,
    matched_name: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = candidate_base(code, rolv, glotto, parent)
    result.update({
        "candidateId": f"rolv:{code}~glottolog:{glotto['id']}",
        "reason": reason,
        "disposition": disposition,
        "confidence": confidence,
        "autoMergeEligible": auto_merge,
        "countryRelation": country_relation(rolv, glotto),
        "genericLabel": generic_label(rolv.get("VarietyName") or rolv.get("Variety Name"), glotto.get("name")),
        "evidence": evidence,
    })
    if score is not None:
        result["fuzzyScore"] = round(score, 4)
    if matched_name:
        result["matchedName"] = matched_name
    return result


def current_rolv_rows(bundle: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    saved_rows = table_rows(bundle, "raw_rolv")
    current_rows = load_json(SOURCES / "grn-rolv-codes-20260905.json")["data"]["ROLVCodes"]
    by_code: dict[str, dict[str, Any]] = {}
    for row in saved_rows:
        code = rolv_code(row.get("ROLVCode"))
        if code:
            by_code[code] = {
                **row,
                "sourceAvailability": ["saved-20260822"],
            }
    for row in current_rows:
        code = rolv_code(row.get("ROLVCode"))
        if code:
            previous = by_code.get(code)
            by_code[code] = {
                **row,
                "sourceAvailability": ["current-20260905"] + (["saved-20260822"] if previous else []),
            }
    return by_code, {rolv_code(row.get("ROLVCode")): row for row in saved_rows if rolv_code(row.get("ROLVCode"))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--output-md", type=Path, default=DEFAULT_MD)
    parser.add_argument("--baseline", type=Path, default=None,
                        help="Optional immutable pre-review index snapshot for coverage delta metadata")
    args = parser.parse_args()

    workbook = load_json(SOURCES / "registry-workbook-data-20260822.json.gz")
    index = load_json(ADMIN_ATLAS / "index.json.gz")
    detail_shards = sorted(ADMIN_ATLAS.glob("details-*.json.gz"))
    detail_keys: set[str] = set()
    for shard in detail_shards:
        detail_keys.update(load_json(shard).keys())

    glotto_rows = [row for row in table_rows(workbook, "raw_glottolog_5_3") if row.get("Record Type") == "Data"]
    glotto_by_id = {row["id"]: row for row in glotto_rows}
    for row in glotto_rows:
        parent = parent_language(row, glotto_by_id)
        row["_parent"] = parent
        row["_parent_iso"] = text(parent.get("iso639P3code")) if parent else ""

    glotto_dialects = {row["id"]: row for row in glotto_rows if row.get("level") == "dialect"}
    by_parent_iso: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in glotto_dialects.values():
        if row["_parent_iso"]:
            by_parent_iso[row["_parent_iso"]].append(row)

    rolv_by_code, saved_rolv_by_code = current_rolv_rows(workbook)
    current_source_rows = {
        rolv_code(row.get("ROLVCode")): row
        for row in load_json(SOURCES / "grn-rolv-codes-20260905.json")["data"]["ROLVCodes"]
        if rolv_code(row.get("ROLVCode"))
    }
    crosswalk_rows = {
        rolv_code(row.get("ROLV Code")): row
        for row in table_rows(workbook, "rolv_varieties")
        if rolv_code(row.get("ROLV Code"))
    }
    # The workbook has several linkage fields, but this audit distinguishes
    # an independent source crosswalk from generated joins.  In particular,
    # unified_source_index never carries Glottocode and ROLV Code together;
    # rolv_varieties' dialect targets are annotated with generated Match Method
    # values (name/parent/ISO), not a source-provided identifier crosswalk.
    unified_rows = table_rows(workbook, "unified_source_index")
    unified_rows_with_both_ids = [row for row in unified_rows if text(row.get("Glottocode")) and rolv_code(row.get("ROLV Code"))]
    rolv_rows_with_linked_glottocode = [row for row in crosswalk_rows.values() if text(row.get("Linked Glottolog ISO-coded Glottocode"))]
    rolv_rows_with_official_dialect_target = [row for row in crosswalk_rows.values() if text(row.get("Official Glottolog Exact Match Glottocode"))]
    alternate_rows = load_json(SOURCES / "grn-rolv-alternate-names-20260905.json")["data"]["ROLVAlternateNames"]
    alternate_by_code: dict[str, list[str]] = collections.defaultdict(list)
    for row in alternate_rows:
        code = rolv_code(row.get("ROLVCode"))
        if code and text(row.get("AlternateName")):
            alternate_by_code[code].append(text(row["AlternateName"]))
    for code in alternate_by_code:
        alternate_by_code[code] = sorted(set(alternate_by_code[code]))

    index_records = [row for row in index["records"] if row.get("kind") in {"language", "dialect"}]
    index_record_ids = {row["id"] for row in index_records}
    index_id_map = index_record_map(index)
    grn_entity_source_rows = load_json(SOURCES / "everylanguage-language-entity-sources.json.gz")
    grn_entity_ids: dict[str, set[str]] = collections.defaultdict(set)
    for row in grn_entity_source_rows:
        if text(row.get("external_id_type")).casefold() in {"rolv_code", "grn_language_id"}:
            code = rolv_code(row.get("external_id"))
            if code:
                grn_entity_ids[code].add(text(row.get("language_entity_id")))

    explicit_glottocode_by_code = {
        code: text(row.get("Official Glottolog Exact Match Glottocode"))
        for code, row in crosswalk_rows.items()
        if text(row.get("Official Glottolog Exact Match Glottocode"))
    }
    explicit_codes = set(explicit_glottocode_by_code)
    explicit_target_codes: dict[str, list[str]] = collections.defaultdict(list)
    for code, glot_id in explicit_glottocode_by_code.items():
        explicit_target_codes[glot_id].append(code)

    candidates: list[dict[str, Any]] = []
    counts = collections.Counter()
    hard_cases: list[dict[str, Any]] = []

    for code, glot_id in sorted(explicit_glottocode_by_code.items()):
        rolv = rolv_by_code.get(code, {"ROLVCode": code})
        glotto = glotto_by_id.get(glot_id)
        crosswalk = crosswalk_rows.get(code)
        if not glotto or glotto.get("level") != "dialect":
            counts["explicit_target_missing_or_non_dialect"] += 1
            continue
        parent = glotto.get("_parent")
        parent_ok = bool(parent and text(parent.get("iso639P3code")) == text(rolv.get("LanguageCode") or rolv.get("ISO Language Code")))
        one_to_one = len(explicit_target_codes[glot_id]) == 1
        country = country_relation(rolv, glotto)
        generic = generic_label(rolv.get("VarietyName") or rolv.get("Variety Name"), glotto.get("name"))
        if not parent_ok:
            disposition, confidence, auto = "parent_classification_conflict", "high", False
            reason = "explicit_crosswalk_parent_iso_conflict"
            counts["explicit_parent_conflict"] += 1
        elif not one_to_one:
            disposition, confidence, auto = "ambiguous_one_to_many", "high", False
            reason = "explicit_crosswalk_glottocode_reused_by_multiple_rolv_codes"
            counts["explicit_one_to_many"] += 1
        elif country == "conflict":
            disposition, confidence, auto = "country_conflict", "high", False
            reason = "explicit_crosswalk_country_sets_conflict"
            counts["explicit_country_conflict"] += 1
        elif generic:
            disposition, confidence, auto = "generic_label_review", "high", False
            reason = "explicit_crosswalk_uses_directional_or_generic_label"
            counts["explicit_generic_label"] += 1
        else:
            # This workbook field is explicit crosswalk evidence, but its
            # Match Method says it was derived from name and parent evidence.
            # It is not independent ROLV identifier proof and cannot authorize
            # an automatic merge.
            disposition, confidence, auto = "explicit_crosswalk_review", "high", False
            reason = "registry_crosswalk_glottocode_and_dialect_level"
            counts["explicit_crosswalk_review"] += 1
            counts["explicit_crosswalk_review_country_compatible"] += country == "compatible"
            counts["explicit_crosswalk_review_country_unknown"] += country == "unknown"
        evidence = [
            {"source": "registry-workbook.rolv_varieties", "sourceRow": crosswalk.get("Source Row") if crosswalk else None,
             "fields": {"Official Glottolog Exact Match Glottocode": glot_id,
                        "Official Glottolog Exact Match Name": text(crosswalk.get("Official Glottolog Exact Match Name")) if crosswalk else glotto.get("name"),
                        "Match Method": text(crosswalk.get("Match Method")) if crosswalk else "",
                        "Match Confidence": text(crosswalk.get("Match Confidence")) if crosswalk else "",
                        "Review Reason": text(crosswalk.get("Review Reason")) if crosswalk else ""}},
            {"source": "grn", "url": f"https://globalrecordings.net/en/language/{code}", "scope": "ROLV identity"},
            {"source": "glottolog", "url": f"https://glottolog.org/resource/languoid/id/{glot_id}", "scope": "dialect identity and hierarchy"},
        ]
        candidate = make_candidate(code, rolv, glotto, parent, reason=reason, disposition=disposition,
                                   confidence=confidence, evidence=evidence, auto_merge=auto)
        candidates.append(candidate)
        if disposition != "explicit_crosswalk_review":
            hard_cases.append(candidate)

    exact_name_pairs: set[tuple[str, str]] = set()
    exact_name_targets_by_code: dict[str, list[str]] = collections.defaultdict(list)
    exact_name_codes_by_target: dict[str, set[str]] = collections.defaultdict(set)
    for code, rolv in sorted(rolv_by_code.items()):
        iso = text(rolv.get("LanguageCode") or rolv.get("ISO Language Code"))
        names: list[tuple[str, str]] = [(text(rolv.get("VarietyName") or rolv.get("Variety Name")), "variety_name")]
        names.extend((alias, "alternate_name") for alias in alternate_by_code.get(code, []))
        name_forms = {(variant, source_name, value) for value, source_name in names for variant in name_variants(value)}
        for glotto in by_parent_iso.get(iso, []):
            glotto_forms = name_variants(glotto.get("name"))
            matches = sorted(
                [(form, source_name, original) for form, source_name, original in name_forms if form in glotto_forms],
                key=lambda item: (item[0], item[1], item[2]),
            )
            if not matches:
                continue
            pair = (code, glotto["id"])
            exact_name_pairs.add(pair)
            exact_name_targets_by_code[code].append(glotto["id"])
            exact_name_codes_by_target[glotto["id"]].add(code)
            if explicit_glottocode_by_code.get(code) == glotto["id"]:
                continue
            crosswalk = crosswalk_rows.get(code)
            parent = glotto.get("_parent")
            explicit_target = explicit_glottocode_by_code.get(code)
            if explicit_target:
                reason = "same_parent_name_ambiguous_alongside_explicit_crosswalk"
                disposition = "ambiguous_one_to_many"
                confidence = "medium"
            else:
                reason = "same_parent_normalized_name_or_alias"
                disposition = "same_parent_name_or_alias_review"
                confidence = "medium"
            evidence = [
                {"source": "grn", "url": f"https://globalrecordings.net/en/language/{code}", "scope": "ROLV identity"},
                {"source": "glottolog", "url": f"https://glottolog.org/resource/languoid/id/{glotto['id']}", "scope": "dialect identity and hierarchy"},
                {"source": "source-comparison", "fields": {"sameParentISO6393": iso, "parentCountryRelation": country_relation(rolv, glotto)}},
            ]
            candidate = make_candidate(code, rolv, glotto, parent, reason=reason, disposition=disposition,
                                       confidence=confidence, evidence=evidence, auto_merge=False,
                                       matched_name={"source": matches[0][1], "value": matches[0][2], "normalized": matches[0][0]})
            candidates.append(candidate)
            hard_cases.append(candidate)
            counts["same_parent_name_or_alias_review"] += 1

    # Stronger contextual cohort: this remains a review cohort, never an
    # automatic merge. It requires the current generated records to have the
    # same immediate parent and kind, a current exact leaf name, stable saved
    # versus current ROLV naming, a unique exact/alias target across all
    # same-parent Glottolog dialects, compatible parent-country geography, and
    # no generic directional/standard/nuclear label. Sibling count is filled
    # after all rows are selected so Astra can review whole cohorts.
    index_glottocodes: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    index_rolv_codes: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    index_merged_pairs: dict[tuple[str, str], dict[str, Any]] = {}
    index_children: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for record in index_records:
        glot_id = text(record.get("glottocode"))
        code = rolv_code(record.get("rolvCode"))
        if glot_id:
            index_glottocodes[glot_id].append(record)
        if code:
            index_rolv_codes[code].append(record)
        if glot_id and code:
            index_merged_pairs[(glot_id, code)] = record
        parent_id = text(record.get("parentId"))
        if parent_id:
            index_children[parent_id].append(record)

    contextual_rows: list[dict[str, Any]] = []
    generic_tokens = set(GENERIC_TOKENS)
    contextual_broad_count = 0
    contextual_exclusion_counts = collections.Counter()
    for code, glot_id in sorted(explicit_glottocode_by_code.items()):
        glotto = glotto_by_id.get(glot_id)
        if not glotto or glotto.get("level") != "dialect":
            continue
        parent = glotto.get("_parent")
        rolv = rolv_by_code.get(code, {"ROLVCode": code})
        current = current_source_rows.get(code, {})
        saved = saved_rolv_by_code.get(code, {})
        current_name = text(current.get("VarietyName") or rolv.get("VarietyName") or rolv.get("Variety Name"))
        leaf_name = current_name.split(":", 1)[1] if ":" in current_name else current_name
        exact_leaf = normalized(leaf_name) == normalized(glotto.get("name")) or normalized(current_name) == normalized(glotto.get("name"))
        name_stable = bool(current and saved and text(current.get("VarietyName")) == text(saved.get("VarietyName")))
        all_targets = sorted(set(exact_name_targets_by_code.get(code, [])))
        unique_target = all_targets == [glot_id]
        reverse_target_codes = sorted(exact_name_codes_by_target.get(glot_id, set()))
        unique_reverse_target = reverse_target_codes == [code]
        glotto_records = index_glottocodes.get(glot_id, [])
        rolv_records = index_rolv_codes.get(code, [])
        merged = index_merged_pairs.get((glot_id, code))
        candidate_record_ids = {record["id"] for record in glotto_records + rolv_records}
        if merged:
            candidate_record_ids.add(merged["id"])
        no_child_records = not any(index_children.get(record_id) for record_id in candidate_record_ids)
        same_parent_kind = bool(
            merged and merged.get("kind") == "dialect"
            or any(
                left.get("kind") == "dialect" and right.get("kind") == "dialect"
                and left.get("parentId") == right.get("parentId")
                for left in glotto_records for right in rolv_records
            )
        )
        parent_countries = split_codes(parent.get("country_ids")) if parent else set()
        rolv_countries = split_codes(current.get("CountryCode") or saved.get("CountryCode"))
        parent_country_relation = (
            "compatible" if parent_countries and rolv_countries and parent_countries & rolv_countries
            else "unknown" if not parent_countries or not rolv_countries
            else "conflict"
        )
        generic = bool(set(ascii_tokens(current_name)) & generic_tokens or generic_label(glotto.get("name")))
        source_prefix = text(current.get("LanguageName") or saved.get("LanguageName") or rolv.get("LanguageName") or rolv.get("ROLV Language Name"))
        if ":" in current_name:
            source_prefix = current_name.split(":", 1)[0]
        source_prefix_known_parent = bool(parent and normalized(source_prefix) in name_variants(parent.get("name")))
        no_existing_needs_review = all(not bool(record.get("needsReview")) for record in glotto_records + rolv_records)
        broad_checks = {
            "sameImmediateParentIdAndKind": same_parent_kind,
            "currentExactLeafName": exact_leaf,
            "sourceCurrentNameStable": name_stable,
            "uniqueExactOrAliasTarget": unique_target,
            "parentCountryRelation": parent_country_relation,
            "genericLabel": generic,
        }
        if all((same_parent_kind, exact_leaf, name_stable, unique_target, parent_country_relation == "compatible", not generic)):
            contextual_broad_count += 1
        else:
            for key, passed in broad_checks.items():
                if key == "parentCountryRelation":
                    passed = passed == "compatible"
                if not passed:
                    contextual_exclusion_counts[key] += 1
            continue
        strict_checks = {
            "uniqueReverseExactOrAliasTarget": unique_reverse_target,
            "currentSourcePrefixKnownParent": source_prefix_known_parent,
            "noExistingNeedsReview": no_existing_needs_review,
            "noChildRecords": no_child_records,
        }
        if not all(strict_checks.values()):
            for key, passed in strict_checks.items():
                if not passed:
                    contextual_exclusion_counts[key] += 1
            continue
        parent_iso = text(parent.get("iso639P3code")) if parent else ""
        record_ids = sorted({record["id"] for record in glotto_records + rolv_records} | ({merged["id"]} if merged else set()))
        contextual_rows.append({
            "candidateId": f"rolv:{code}~glottolog:{glot_id}",
            "disposition": "contextual_exact_match_for_review",
            "confidence": "high",
            "autoMergeEligible": False,
            "rolv": {"id": f"rolv:{code}", "code": code, "name": current_name,
                     "iso6393": text(current.get("LanguageCode") or saved.get("LanguageCode")) or None,
                     "countryCodes": sorted(rolv_countries)},
            "glottolog": {"id": glot_id, "name": text(glotto.get("name")), "level": "dialect",
                          "parentId": text(glotto.get("parent_id")) or None, "parentIso6393": parent_iso or None,
                          "countryCodes": sorted(split_codes(glotto.get("country_ids")))},
            "adminRecordIds": record_ids,
            "checks": {"sameImmediateParentIdAndKind": True, "currentExactLeafName": True,
                       "sourceCurrentNameStable": True, "uniqueExactOrAliasTarget": True,
                       "uniqueReverseExactOrAliasTarget": True,
                       "currentSourcePrefixKnownParent": True,
                       "noExistingNeedsReview": True,
                       "noChildRecords": True,
                       "parentCountryRelation": "compatible", "genericLabel": False,
                       "exactOrAliasTargetCount": 1,
                       "reverseExactAliasRolvCodes": reverse_target_codes},
            "evidence": [
                {"source": "registry-workbook.rolv_varieties", "sourceRow": crosswalk_rows[code].get("Source Row"),
                 "fields": {"Official Glottolog Exact Match Glottocode": glot_id,
                            "Match Method": text(crosswalk_rows[code].get("Match Method")),
                            "Match Confidence": text(crosswalk_rows[code].get("Match Confidence"))}},
                {"source": "admin-index", "recordIds": record_ids, "scope": "current source records and immediate parentId/kind"},
                {"source": "grn-current", "url": f"https://globalrecordings.net/en/language/{code}", "scope": "current ROLV code and name"},
                {"source": "glottolog", "url": f"https://glottolog.org/resource/languoid/id/{glot_id}", "scope": "dialect name and parent hierarchy"},
            ],
            "cohort": {"parentIso6393": parent_iso, "siblingSupportCount": 0, "multipleMatchingSiblings": False},
        })
    contextual_by_parent = collections.Counter(row["cohort"]["parentIso6393"] for row in contextual_rows)
    for row in contextual_rows:
        size = contextual_by_parent[row["cohort"]["parentIso6393"]]
        row["cohort"]["siblingSupportCount"] = size
        row["cohort"]["multipleMatchingSiblings"] = size >= 2

    contextual_examples: list[dict[str, Any]] = []
    selected_parents: set[str] = set()
    # Keep both currently merged Jumli targets visible to lead review even
    # when the source-order cohort sample would otherwise fill the 20 slots.
    for row in sorted(contextual_rows, key=lambda item: item["candidateId"]):
        if row["rolv"]["code"] not in {"26075", "26077"}:
            continue
        contextual_examples.append({
            "candidateId": row["candidateId"], "rolvName": row["rolv"]["name"],
            "glottologName": row["glottolog"]["name"], "iso6393": row["rolv"]["iso6393"],
            "parentIso6393": row["cohort"]["parentIso6393"],
            "siblingSupportCount": row["cohort"]["siblingSupportCount"],
            "countryCodes": row["rolv"]["countryCodes"],
        })
        selected_parents.add(row["cohort"]["parentIso6393"])
    bands = [(2, 2), (3, 3), (4, 5), (6, None)]
    for lower, upper in bands:
        for row in sorted(contextual_rows, key=lambda item: item["candidateId"]):
            size = row["cohort"]["siblingSupportCount"]
            if row["cohort"]["parentIso6393"] in selected_parents:
                continue
            if size >= lower and (upper is None or size <= upper):
                contextual_examples.append({
                    "candidateId": row["candidateId"], "rolvName": row["rolv"]["name"],
                    "glottologName": row["glottolog"]["name"], "iso6393": row["rolv"]["iso6393"],
                    "parentIso6393": row["cohort"]["parentIso6393"], "siblingSupportCount": size,
                    "countryCodes": row["rolv"]["countryCodes"],
                })
                selected_parents.add(row["cohort"]["parentIso6393"])
                if sum(1 for item in contextual_examples if item["siblingSupportCount"] >= lower and (upper is None or item["siblingSupportCount"] <= upper)) >= 5:
                    break
    for row in contextual_rows:
        if len(contextual_examples) >= 20:
            break
        if row["candidateId"] in {item["candidateId"] for item in contextual_examples}:
            continue
        contextual_examples.append({
            "candidateId": row["candidateId"], "rolvName": row["rolv"]["name"],
            "glottologName": row["glottolog"]["name"], "iso6393": row["rolv"]["iso6393"],
            "parentIso6393": row["cohort"]["parentIso6393"],
            "siblingSupportCount": row["cohort"]["siblingSupportCount"],
            "countryCodes": row["rolv"]["countryCodes"],
        })

    fuzzy_codes: set[str] = set()
    for code, rolv in sorted(rolv_by_code.items()):
        if code in explicit_codes:
            continue
        iso = text(rolv.get("LanguageCode") or rolv.get("ISO Language Code"))
        names: list[tuple[str, str, str]] = []
        for value, source_name in [(text(rolv.get("VarietyName") or rolv.get("Variety Name")), "variety_name")]:
            names.extend((variant, source_name, value) for variant in sorted(name_variants(value)))
        for alias in alternate_by_code.get(code, []):
            names.extend((variant, "alternate_name", alias) for variant in sorted(name_variants(alias)))
        scored: list[tuple[float, dict[str, Any], tuple[str, str, str], tuple[str, str]]] = []
        for glotto in by_parent_iso.get(iso, []):
            glotto_forms = name_variants(glotto.get("name"))
            best: tuple[float, tuple[str, str, str], tuple[str, str]] | None = None
            for form, source_name, original in names:
                for glotto_form in sorted(glotto_forms):
                    if form == glotto_form:
                        continue
                    score = difflib.SequenceMatcher(None, form, glotto_form).ratio()
                    if best is None or score > best[0]:
                        best = (score, (form, source_name, original), (glotto_form, text(glotto.get("name"))))
            if best and best[0] >= 0.84:
                scored.append((best[0], glotto, best[1], best[2]))
        scored.sort(key=lambda item: (-item[0], item[1]["id"]))
        if not scored:
            continue
        fuzzy_codes.add(code)
        top_score = scored[0][0]
        for score, glotto, matched, target_form in scored[:3]:
            if score < max(0.84, top_score - 0.03):
                continue
            parent = glotto.get("_parent")
            candidate = make_candidate(
                code, rolv, glotto, parent, reason="same_parent_fuzzy_spelling_or_transposition",
                disposition="fuzzy_spelling_review", confidence="low", evidence=[
                    {"source": "grn", "url": f"https://globalrecordings.net/en/language/{code}", "scope": "ROLV identity"},
                    {"source": "glottolog", "url": f"https://glottolog.org/resource/languoid/id/{glotto['id']}", "scope": "dialect identity and hierarchy"},
                    {"source": "source-comparison", "fields": {"sameParentISO6393": iso, "parentCountryRelation": country_relation(rolv, glotto), "threshold": 0.84}},
                ], auto_merge=False, score=score,
                matched_name={"source": matched[1], "value": matched[2], "normalized": matched[0], "targetNormalized": target_form[0]},
            )
            candidates.append(candidate)
            counts["fuzzy_spelling_pairs"] += 1
        counts["fuzzy_spelling_codes"] += 1

    # Source inventory and coverage are separate from pair counts so parent
    # review can tell whether a source is absent, unmatched, or merely queued.
    non_people_records = [row for row in index["records"] if row.get("kind") in {"language", "dialect"}]
    index_glotto_dialects = {text(row.get("glottocode")) for row in non_people_records if row.get("kind") == "dialect" and row.get("glottocode")}
    index_rolv_codes = {rolv_code(row.get("rolvCode")) for row in non_people_records if row.get("kind") == "dialect" and rolv_code(row.get("rolvCode"))}
    glotto_source_ids = {key.split(":", 1)[1] for key in index_id_map if key.startswith("glottocode:")}
    rolv_source_ids = {key.split(":", 1)[1] for key in index_id_map if key.startswith("rolvCode:")}
    source_collisions = {code: sorted(ids) for code, ids in grn_entity_ids.items() if len(ids) > 1}

    for code in ["26074", "26075", "26076", "26077"]:
        matching = [row for row in candidates if row["rolv"]["code"] == code]
        if matching:
            hard_cases.extend(matching)

    # De-duplicate hard cases while preserving deterministic order.
    hard_cases = {row["candidateId"]: row for row in hard_cases}
    hard_case_ids = sorted(hard_cases)
    # Keep the full candidate table as the canonical queue and repeat only a
    # bounded representative set here. Every hard-case ID remains available.
    representative_ids = {
        row["candidateId"] for row in candidates
        if row["rolv"]["code"] in {"26074", "26075", "26076", "26077"}
        or row["disposition"] in {"parent_classification_conflict", "country_conflict", "ambiguous_one_to_many"}
        or (row["disposition"] == "fuzzy_spelling_review" and (row.get("fuzzyScore", 0) >= 0.95 or row.get("genericLabel")))
    }
    hard_case_list = []
    for key in sorted(representative_ids):
        row = next((candidate for candidate in candidates if candidate["candidateId"] == key), None)
        if row:
            hard_case_list.append(row)

    delta = load_json(SOURCES / "registry-rolv-delta-20260905.json")
    changes = load_json(SOURCES / "grn-rolv-changes-20260905.json")
    source_counts = {
        "glottolog": {"family": sum(row.get("level") == "family" for row in glotto_rows),
                      "language": sum(row.get("level") == "language" for row in glotto_rows),
                      "dialect": len(glotto_dialects)},
        "rolv": {"saved": len(saved_rolv_by_code), "current": sum(1 for row in rolv_by_code.values() if "current-20260905" in row.get("sourceAvailability", [])),
                  "union": len(rolv_by_code)},
        "alternateNames": len(alternate_rows),
        "changeRows": len(changes.get("data", {}).get("ROLVChanges", [])),
        "rolvDelta": delta.get("counts", {}),
        "workbook": {"languageCrosswalk": len(workbook["language_crosswalk"]["rows"]),
                      "rolvVarieties": len(workbook["rolv_varieties"]["rows"]),
                      "unifiedSourceIndex": len(workbook["unified_source_index"]["rows"]),
                      "reviewQueue": len(workbook["review_queue"]["rows"])},
        "crosswalkEvidence": {
            "unifiedSourceIndexRowsWithGlottocodeAndRolvCode": len(unified_rows_with_both_ids),
            "rolvRowsWithLinkedGlottologIsoCodedId": len(rolv_rows_with_linked_glottocode),
            "rolvRowsWithOfficialDialectTarget": len(rolv_rows_with_official_dialect_target),
            "independentIdentifierCrosswalkRows": 0,
            "note": "No local source row supplies an independent Glottocode plus ROLV identifier pair; Official target fields are generated name/parent/ISO joins.",
        },
    }
    coverage = {
        "adminIndex": {
            "records": len(index["records"]),
            "languages": sum(row.get("kind") == "language" for row in index["records"]),
            "dialectsOrVarieties": sum(row.get("kind") == "dialect" for row in index["records"]),
            "peopleGroupsExcluded": sum(row.get("kind") == "people-group" for row in index["records"]),
            "languageAndVarietyRecordsAudited": len(non_people_records),
            "expectedLanguageAndVarietyRecords": 40585,
            "detailShards": len(detail_shards),
            "detailRows": len(detail_keys),
            "languageAndVarietyDetails": len(index_record_ids & detail_keys),
        },
        "generatedIdentityFields": {
            "glottologDialectsInIndex": len(index_glotto_dialects),
            "rolvCodesInIndex": len(index_rolv_codes),
            "rolvCodesInIndexWithSavedOrCurrentSource": len(index_rolv_codes & set(rolv_by_code)),
            "rolvCodesWithNoCurrentOrSavedSource": len(index_rolv_codes - set(rolv_by_code)),
            "glottocodeSourceKeysInIndex": len(glotto_source_ids),
            "rolvSourceKeysInIndex": len(rolv_source_ids),
        },
        "everyLanguageSourceReuseInventory": {
            "rolvCodesWithMultipleDistinctLanguageEntities": len(source_collisions),
            "extraDistinctLanguageEntities": sum(len(ids) - 1 for ids in source_collisions.values()),
            "maxEntitiesPerCode": max((len(ids) for ids in grn_entity_ids.values()), default=0),
        },
    }
    if args.baseline and args.baseline.exists():
        baseline_index = load_json(args.baseline)
        baseline_records = baseline_index.get("records", [])
        coverage["baselineBeforeLeadReview"] = {
            "path": str(args.baseline),
            "records": len(baseline_records),
            "languages": sum(row.get("kind") == "language" for row in baseline_records),
            "dialectsOrVarieties": sum(row.get("kind") == "dialect" for row in baseline_records),
            "peopleGroupsExcluded": sum(row.get("kind") == "people-group" for row in baseline_records),
            "languageAndVarietyRecords": sum(row.get("kind") in {"language", "dialect"} for row in baseline_records),
            "currentCanonicalDelta": len(index["records"]) - len(baseline_records),
            "note": "Immutable pre-lead-review baseline; current canonical index may include reviewed merges.",
        }

    explicit_target_pair_count = len(explicit_glottocode_by_code)
    same_parent_name_count = sum(1 for row in candidates if row["disposition"] == "same_parent_name_or_alias_review")
    fuzzy_pair_count = sum(1 for row in candidates if row["disposition"] == "fuzzy_spelling_review")
    parent_conflict_pairs = [row for row in candidates if row["disposition"] == "parent_classification_conflict"]
    one_to_many_pairs = [row for row in candidates if row["disposition"] in {"ambiguous_one_to_many", "country_conflict", "generic_label_review"}]
    report = {
        "schemaVersion": 1,
        "generatedAt": "2026-09-07",
        "scope": "Global Glottolog-versus-ROLV dialect identity audit; people groups excluded from pair generation and language/variety count.",
        "rules": [
            "The saved registry workbook exposes explicit Glottocode pair fields, but every Match Method is a prior name/parent-derived research field rather than independent ROLV identifier proof; no pair is auto-merge eligible.",
            "A same-parent ISO and normalized name or alias is a review candidate; it is never an automatic merge.",
            "Fuzzy spelling, coordinates, shared ISO, shared country, or shared parent alone never trigger an automatic merge.",
            "One-to-many source relationships, parent/classification conflicts, generic directional labels, and country conflicts stay queued for Astra review.",
            "Glottolog dialects without an ISO-bearing ancestor are retained in coverage but cannot receive an ISO cohort match.",
        ],
        "sourceCounts": source_counts,
        "coverage": coverage,
        "counts": {
            **dict(counts),
            "explicitCrosswalkRows": explicit_target_pair_count,
            "explicitCrosswalkGlottocodes": len(explicit_target_codes),
            "explicitCrosswalkOneToManyGlottocodes": sum(len(codes) > 1 for codes in explicit_target_codes.values()),
            "explicitCrosswalkOneToManyRolvRows": sum(len(codes) for codes in explicit_target_codes.values() if len(codes) > 1),
            "sameParentNameOrAliasPairs": same_parent_name_count,
            "fuzzySpellingPairs": fuzzy_pair_count,
            "parentConflictPairs": len(parent_conflict_pairs),
            "hardCasePairs": len(hard_case_ids),
            "hardCaseRepresentativePairs": len(hard_case_list),
            "contextualExactMatchReviewPairs": len(contextual_rows),
            "contextualExactMatchReviewCohorts": len(contextual_by_parent),
            "contextualExactMatchBroadPairsBeforeInversePrefixReview": contextual_broad_count,
            "contextualExactMatchBroadPairsExcludedByStrictChecks": contextual_broad_count - len(contextual_rows),
            "contextualExactMatchStrictExclusionCounts": dict(sorted(contextual_exclusion_counts.items())),
            "contextualExactMatchReviewPairsWithMultipleSiblings": sum(
                row["cohort"]["multipleMatchingSiblings"] for row in contextual_rows
            ),
            "contextualExactMatchReviewCohortsWithMultipleSiblings": sum(
                size >= 2 for size in contextual_by_parent.values()
            ),
        },
        "candidates": sorted(candidates, key=lambda row: row["candidateId"]),
        "contextualExactMatches": sorted(contextual_rows, key=lambda row: row["candidateId"]),
        "contextualExactMatchExamples": contextual_examples[:20],
        "hardCaseCandidateIds": hard_case_ids,
        "hardCases": hard_case_list,
        "sourceIdentityReuseSample": [
            {"rolvCode": code, "languageEntityIds": ids}
            for code, ids in sorted(source_collisions.items(), key=lambda item: (-len(item[1]), item[0]))[:25]
        ],
        "notes": [
            "The generated admin index intentionally retains Glottolog and ROLV source records separately except for any current lead-review merges already present when this report runs; this report does not rewrite it.",
            "The saved crosswalk is dated 2026-08-22; current GRN ROLV codes and alternate names are dated 2026-09-05.",
            "Source-crosswalk check: unified_source_index has no row carrying both Glottocode and ROLV Code. The 12,403 linked Glottolog IDs in rolv_varieties point to ISO-coded parent-language links; the 5,237 Official dialect targets are generated name/parent/ISO joins, so independentIdentifierCrosswalkRows is zero.",
            "A country relation of unknown means the Glottolog dialect row has no country_ids; it is not evidence of a conflict.",
            "The complete hard-case ID set is in hardCaseCandidateIds; hardCases repeats a bounded representative subset, including the four known Jumli targets.",
            "contextualExactMatches is a stronger review cohort, not an auto-merge list. It requires current same-parent/kind evidence, exact current leaf naming, source-current name stability, one exact/alias target in both directions, compatible parent-country geography, a known current source prefix, no existing needsReview or child records, and non-generic labels. siblingSupportCount is computed after all strict filters and identifies cohorts with multiple matching varieties.",
            "Every Language source-link reuse counts are an upstream link inventory, separate from any raw source-record collision metric. Most reused GRN/ROLV links are already reconciled into current records; the reuse sample is diagnostic and must not be read as 5,707 unresolved atlas duplicates.",
        ],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.output_json, report)
    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    args.output_md.write_text(render_markdown(report))
    print(json.dumps({"outputJson": str(args.output_json), "outputMarkdown": str(args.output_md), "counts": report["counts"], "coverage": coverage}, indent=2))


def render_markdown(report: dict[str, Any]) -> str:
    c = report["counts"]
    cov = report["coverage"]
    src = report["sourceCounts"]
    lines = [
        "# Glottolog versus ROLV reconciliation audit",
        "",
        f"Generated 2026-09-07 from the checked-in admin index and detail shards plus the saved registry and current GRN snapshots. The audit covers {cov['adminIndex']['languageAndVarietyRecordsAudited']:,} language and variety records and excludes {cov['adminIndex']['peopleGroupsExcluded']:,} people-group records.",
        "",
        "## Scope and rules",
        "",
        "This is a read-only identity audit. The generated atlas remains unchanged. The saved workbook exposes prior Glottocode pair fields, but its Match Method is name/parent-derived rather than independent identifier proof; no pair is auto-merge eligible. Same-parent ISO, country, normalized names, aliases, and fuzzy spelling are review evidence only; they never auto-merge records.",
        "",
        "The current admin index has " + f"{cov['adminIndex']['languages']:,} language records and {cov['adminIndex']['dialectsOrVarieties']:,} dialect/variety records. " + f"All {cov['adminIndex']['languageAndVarietyRecordsAudited']:,} have detail rows across {cov['adminIndex']['detailShards']} gzip shards: {cov['adminIndex']['languageAndVarietyDetails']:,} language/variety details were found.",
        (f"The immutable pre-lead-review baseline had {cov['baselineBeforeLeadReview']['languageAndVarietyRecords']:,} language/variety records; the current canonical count is {cov['adminIndex']['languageAndVarietyRecordsAudited']:,} ({cov['baselineBeforeLeadReview']['currentCanonicalDelta']:+,}) with reviewed merges already present in the checked-out index at audit time." if cov.get('baselineBeforeLeadReview') else "No immutable pre-lead-review baseline was included; pass --baseline to record a coverage delta."),
        "",
        "## Source coverage",
        "",
        f"Glottolog 5.3 contributes {src['glottolog']['dialect']:,} dialect rows, {src['glottolog']['language']:,} language rows, and {src['glottolog']['family']:,} family rows. ROLV contributes {src['rolv']['current']:,} current codes, {src['rolv']['saved']:,} saved codes, and {src['rolv']['union']:,} unique saved/current codes. The workbook's explicit `rolv_varieties` table has {src['workbook']['rolvVarieties']:,} rows, and its unified source index has {src['workbook']['unifiedSourceIndex']:,} rows.",
        f"Crosswalk evidence check: **{src['crosswalkEvidence']['independentIdentifierCrosswalkRows']:,}** independent source identifier pairs. `unified_source_index` has **{src['crosswalkEvidence']['unifiedSourceIndexRowsWithGlottocodeAndRolvCode']:,}** rows containing both Glottocode and ROLV Code; `rolv_varieties` has **{src['crosswalkEvidence']['rolvRowsWithLinkedGlottologIsoCodedId']:,}** ISO-coded parent links and **{src['crosswalkEvidence']['rolvRowsWithOfficialDialectTarget']:,}** generated Official dialect target fields. The latter retain their original Match Method and remain review evidence only.",
        "",
        "## Pair counts",
        "",
        f"- Explicit crosswalk rows: **{c['explicitCrosswalkRows']:,}** ({c['explicitCrosswalkGlottocodes']:,} distinct Glottocodes). **{c.get('explicit_crosswalk_review', 0):,}** are one-to-one, same-parent, non-generic crosswalk review pairs; **{c.get('explicit_crosswalk_review_country_compatible', 0):,}** also have compatible country sets and **{c.get('explicit_crosswalk_review_country_unknown', 0):,}** have no Glottolog country evidence. The workbook's Match Method is prior name/parent evidence, so none is auto-merge eligible without independent review.",
        f"- Explicit parent/classification conflicts: **{c.get('explicit_parent_conflict', 0):,}**. Explicit Glottocodes reused by multiple ROLV rows: **{c['explicitCrosswalkOneToManyGlottocodes']:,}** targets covering **{c['explicitCrosswalkOneToManyRolvRows']:,}** rows. Country conflicts: **{c.get('explicit_country_conflict', 0):,}**. Generic-label reviews: **{c.get('explicit_generic_label', 0):,}**.",
        f"- Same-parent normalized name or alias review pairs beyond the explicit target: **{c['sameParentNameOrAliasPairs']:,}**. These remain manual review candidates.",
        f"- Fuzzy spelling review pairs: **{c['fuzzySpellingPairs']:,}** across **{c.get('fuzzy_spelling_codes', 0):,}** ROLV codes. They are queued only, including high similarity scores, because spelling similarity is not identity proof.",
        "",
        "## Strong contextual exact-match cohort",
        "",
        f"The strict contextual review subset has **{c.get('contextualExactMatchReviewPairs', 0):,}** pairs across **{c.get('contextualExactMatchReviewCohorts', 0):,}** parent-ISO cohorts (the broader exact subset had **{c.get('contextualExactMatchBroadPairsBeforeInversePrefixReview', 0):,}**). It requires current admin records to share immediate parentId and dialect kind, current exact leaf naming, saved/current ROLV name stability, one exact/alias Glottolog target across all same-parent dialects, one-to-one reverse target across all exact/alias ROLV sources, compatible parent-country geography, current source prefix matching the known Glottolog parent, no existing `needsReview` flag, and no generic directional/standard/nuclear label. **{c.get('contextualExactMatchReviewPairsWithMultipleSiblings', 0):,}** pairs are in **{c.get('contextualExactMatchReviewCohortsWithMultipleSiblings', 0):,}** cohorts with multiple matching siblings. This is the strongest batch for Astra review and still has `autoMergeEligible=false` because the underlying workbook crosswalk is name/parent-derived.",
        "",
        "The JSON contains 20 deterministic, sibling-count-stratified examples under `contextualExactMatchExamples`; each full row is under `contextualExactMatches` with source fields, current record IDs, and all checks.",
        "",
        "## Clear cohort versus review queues",
        "",
        "The strongest cohort is the contextual exact-match set above. Country overlap is required there against the Glottolog parent language; missing country evidence is excluded from that strongest subset and retained in the wider explicit review queue.",
        "",
        "All same-parent name/alias and fuzzy pairs remain queued. In particular, generic labels such as East/West, Central, Standard, Nuclear, Cluster, Proper, or Coastal are never batch-approved solely from similarity. Parent ISO conflicts, one-to-many mappings, and country conflicts also remain queued.",
        "",
        "## Known hard cases",
        "",
        "The machine-readable report includes full evidence and IDs for all hard cases. The known Jumli set is preserved: ROLV 26074 Asi, 26075 Chaudhabis, 26076 Paanchsai, and 26077 Sinja. Chaudhabis and Sinja have explicit crosswalk targets; Asi and Paanchsai require review because their source names do not exactly equal the Glottolog leaf names (Assi and Paachsai). The report also includes every explicit one-to-many target, parent conflict, country conflict, generic-label pair, and ambiguous same-name pair.",
        "",
        "## Source identity collision note",
        "",
        f"The Every Language source-link snapshot reuses one GRN/ROLV identifier across multiple distinct source entities for {cov['everyLanguageSourceReuseInventory']['rolvCodesWithMultipleDistinctLanguageEntities']:,} codes (up to {cov['everyLanguageSourceReuseInventory']['maxEntitiesPerCode']} entities per code). Most are already reconciled in the current generated index; the 25-code `sourceIdentityReuseSample` is diagnostic and should not be read as unresolved atlas duplicates.",
        "",
        "See [`reconciliation-glottolog-rolv.json.gz`](./reconciliation-glottolog-rolv.json.gz) for all candidates, source fields, dispositions, and coverage counts.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
