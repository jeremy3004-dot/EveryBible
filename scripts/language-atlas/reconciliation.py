"""Apply reviewed, explicit language-identity reconciliations.

This module deliberately does not discover duplicates.  A caller supplies a
reviewed crosswalk and this module validates it, then merges only the records
named by that crosswalk.  It operates on the small ``AtlasBuilder`` surface
used by the language-atlas build: ``records``, ``details``, identifier maps,
and ``report``.
"""

from copy import deepcopy
from collections.abc import Mapping
from urllib.parse import urlsplit


_UNIQUE_FIELDS = ("iso6393", "glottocode", "rolvCode")
_SCRIPTURE_FIELDS = ("scriptureStatus", "scriptureScope")
_DETAIL_LIST_FIELDS = ("evidence", "related", "notes", "links")
_IDENTIFIER_MAP_NAMES = {"glottolog_ids", "iso_ids", "el_ids"}
_COMPATIBLE_KINDS = {"language", "dialect"}
_SCALAR_COMPAT_FIELDS = ("family", "population", "languageContextStatus")


def reconcile_records(builder, decisions):
    """Apply explicit identity groups to an atlas builder.

    ``decisions`` is a sequence of mappings with this shape::

        {
            "canonicalId": "rolv:01234",
            "duplicateIds": ["glottolog:abcd1234"],
            "rationale": "The reviewed source crosswalk identifies ...",
            "evidence": ["https://example.org/source"],
        }

    The function validates every decision and the resulting parent graph
    before mutating the builder.  Re-running a completed decision is safe: an
    old ID recorded in ``alternateIds`` is treated as a stale, already-applied
    crosswalk entry.  Unknown stale IDs still fail closed.

    Returns and stores a report under ``builder.report['reconciliation']``.
    """

    records = getattr(builder, "records", None)
    details = getattr(builder, "details", None)
    if not isinstance(records, Mapping) or not isinstance(details, Mapping):
        raise ValueError("builder must expose records and details mappings")

    raw_decisions = _normalise_decisions(decisions)
    alias_owner = _existing_alias_owners(records)
    _validate_details(details, records, alias_owner)
    plan = _validate_plan(records, alias_owner, raw_decisions)

    # Make all output structures before changing the builder.  This keeps the
    # apply stage deterministic after the fail-closed validation above.
    new_records = deepcopy(dict(records))
    new_details = deepcopy(dict(details))
    map_copies = {}
    for name in _identifier_map_names(builder):
        value = getattr(builder, name)
        if isinstance(value, Mapping):
            map_copies[name] = deepcopy(dict(value))

    alias_map = {}
    merged_groups = []
    for group in plan["groups"]:
        canonical_id = group["canonicalId"]
        duplicate_ids = group["duplicateIds"]
        alias_map.update(group["aliases"])
        _apply_group(new_records, new_details, group)
        merged_groups.append({
            "canonicalId": canonical_id,
            "duplicateIds": duplicate_ids,
            "rationale": group["rationale"],
            "evidence": list(group["evidence"]),
        })

    # Rewrite references after all groups have contributed their aliases.  A
    # nested parent can therefore resolve through a sibling decision group.
    _rewrite_references(new_records, new_details, alias_map)
    for mapping in map_copies.values():
        _rewrite_mapping_values(mapping, alias_map)

    # Commit the prepared dictionaries in place where possible, preserving the
    # builder's object identity for callers that hold these mappings.
    records.clear()
    records.update(new_records)
    details.clear()
    details.update(new_details)
    for name, mapping in map_copies.items():
        target = getattr(builder, name)
        if isinstance(target, Mapping):
            target.clear()
            target.update(mapping)

    stale_groups = plan["staleGroups"]
    report = {
        "mergedGroups": merged_groups,
        "mergedCount": sum(len(group["duplicateIds"]) for group in merged_groups),
        "aliases": dict(sorted(alias_map.items())),
        "staleGroups": stale_groups,
    }
    builder_report = getattr(builder, "report", None)
    if not isinstance(builder_report, dict):
        builder.report = {}
        builder_report = builder.report
    builder_report["reconciliation"] = report
    return report


def _normalise_decisions(decisions):
    if isinstance(decisions, Mapping):
        if "groups" in decisions:
            decisions = decisions["groups"]
        elif "decisions" in decisions:
            decisions = decisions["decisions"]
        else:
            raise ValueError("decisions mapping must contain groups or decisions")
    if isinstance(decisions, (str, bytes)):
        raise ValueError("decisions must be a sequence of decision mappings")
    try:
        return list(decisions)
    except TypeError as exc:
        raise ValueError("decisions must be a sequence of decision mappings") from exc


def _existing_alias_owners(records):
    owners = {}
    for record_id, record in records.items():
        if not isinstance(record, Mapping):
            raise ValueError(f"record is not a mapping: {record_id}")
        aliases = record.get("alternateIds", [])
        if aliases is None:
            aliases = []
        if not isinstance(aliases, list) or any(not isinstance(alias, str) or not alias for alias in aliases):
            raise ValueError(f"alternateIds must be a list of non-empty strings: {record_id}")
        for alias in aliases:
            if alias == record_id or alias in records:
                raise ValueError(f"alternateId conflicts with a current record: {alias}")
            previous = owners.get(alias)
            if previous and previous != record_id:
                raise ValueError(f"alternateId belongs to multiple records: {alias}")
            owners[alias] = record_id
    return owners


def _validate_details(details, records, alias_owner):
    """Reject dangling related rows before any record can be removed."""
    for detail_id, detail in details.items():
        if not isinstance(detail, Mapping):
            raise ValueError(f"detail is not a mapping: {detail_id}")
        related = detail.get("related", []) or []
        if not isinstance(related, list):
            raise ValueError(f"detail related must be a list: {detail_id}")
        for row in related:
            if not isinstance(row, Mapping) or not isinstance(row.get("id"), str) or not row["id"]:
                raise ValueError(f"related row has no valid ID: {detail_id}")
            related_id = row["id"]
            if related_id not in records and related_id not in alias_owner:
                raise ValueError(f"dangling related ID: {detail_id} -> {related_id}")


def _validate_plan(records, alias_owner, decisions):
    groups = []
    stale_groups = []
    claimed_canonicals = set()
    claimed_duplicates = set()
    aliases_to_claim = {}

    for index, decision in enumerate(decisions):
        if not isinstance(decision, Mapping):
            raise ValueError(f"decision {index} must be a mapping")
        required = ("canonicalId", "duplicateIds", "rationale", "evidence")
        missing = [key for key in required if key not in decision]
        if missing:
            raise ValueError(f"decision {index} is missing: {', '.join(missing)}")

        canonical_id = decision["canonicalId"]
        duplicate_ids = decision["duplicateIds"]
        rationale = decision["rationale"]
        evidence = decision["evidence"]
        if not isinstance(canonical_id, str) or not canonical_id:
            raise ValueError(f"decision {index} has an invalid canonicalId")
        if canonical_id not in records:
            raise ValueError(f"decision {index} references missing canonical ID: {canonical_id}")
        if not isinstance(duplicate_ids, list) or not duplicate_ids:
            raise ValueError(f"decision {index} duplicateIds must be a non-empty list")
        if any(not isinstance(value, str) or not value for value in duplicate_ids):
            raise ValueError(f"decision {index} has an invalid duplicate ID")
        if len(set(duplicate_ids)) != len(duplicate_ids):
            raise ValueError(f"decision {index} repeats a duplicate ID")
        if canonical_id in duplicate_ids:
            raise ValueError(f"decision {index} makes canonicalId a duplicate")
        if not isinstance(rationale, str) or not rationale.strip():
            raise ValueError(f"decision {index} requires a non-empty rationale")
        if not isinstance(evidence, list) or not evidence or any(not _is_http_url(url) for url in evidence):
            raise ValueError(f"decision {index} evidence must be a non-empty list of http(s) URLs")
        if len(set(evidence)) != len(evidence):
            raise ValueError(f"decision {index} repeats an evidence URL")

        if canonical_id in claimed_canonicals or canonical_id in claimed_duplicates:
            raise ValueError(f"canonical ID is claimed by multiple decision groups: {canonical_id}")
        claimed_canonicals.add(canonical_id)

        current_duplicates = []
        stale_duplicates = []
        for duplicate_id in duplicate_ids:
            if duplicate_id in records:
                if duplicate_id in claimed_duplicates or duplicate_id in claimed_canonicals:
                    raise ValueError(f"duplicate ID is claimed by multiple decision groups: {duplicate_id}")
                current_duplicates.append(duplicate_id)
                claimed_duplicates.add(duplicate_id)
                continue
            owner = alias_owner.get(duplicate_id)
            if owner != canonical_id:
                raise ValueError(f"decision {index} references missing or foreign duplicate ID: {duplicate_id}")
            stale_duplicates.append(duplicate_id)

        # A completed group is a valid stale crosswalk entry.  It must not be
        # treated as a missing ID, and it must not add duplicate metadata.
        if not current_duplicates:
            stale_groups.append({
                "canonicalId": canonical_id,
                "duplicateIds": list(duplicate_ids),
                "reason": "already applied; all duplicate IDs are alternateIds of the canonical record",
            })
            continue

        group = {
            "canonicalId": canonical_id,
            "duplicateIds": current_duplicates,
            "staleIds": stale_duplicates,
            "rationale": rationale.strip(),
            "evidence": list(evidence),
            "aliases": {},
        }
        for record_id in [canonical_id] + current_duplicates:
            record = records[record_id]
            for alias in ([record_id] if record_id != canonical_id else []) + list(record.get("alternateIds", [])):
                previous = aliases_to_claim.get(alias)
                if previous and previous != canonical_id:
                    raise ValueError(f"old ID is claimed by multiple decision groups: {alias}")
                if alias == canonical_id and record_id != canonical_id:
                    raise ValueError(f"duplicate alternateId conflicts with canonical ID: {alias}")
                aliases_to_claim[alias] = canonical_id
                if alias != canonical_id:
                    group["aliases"][alias] = canonical_id
        for stale_id in stale_duplicates:
            # A mixed current/stale group can still be applied safely.  Keep
            # references to the old ID resolvable while the current duplicate
            # is folded into the canonical record.
            group["aliases"][stale_id] = canonical_id
        groups.append(group)

    # Validate only after every group's aliases are known.  This makes parent
    # rewrites independent of the order in which parent and child groups are
    # listed in the reviewed crosswalk.
    for group in groups:
        _validate_group(records, group, alias_owner, aliases_to_claim)
    _validate_final_parent_graph(records, groups, alias_owner)
    return {"groups": groups, "staleGroups": stale_groups}


def _validate_group(records, group, alias_owner, aliases_to_claim):
    member_ids = [group["canonicalId"]] + group["duplicateIds"]
    member_records = [records[record_id] for record_id in member_ids]
    kinds = {record.get("kind") for record in member_records}
    if len(kinds) != 1 or None in kinds:
        raise ValueError(f"identity group has incompatible kinds: {member_ids}")
    if next(iter(kinds)) not in _COMPATIBLE_KINDS:
        raise ValueError(f"identity group has unsupported kind: {next(iter(kinds))}")

    for field in _UNIQUE_FIELDS:
        values = {record.get(field) for record in member_records if record.get(field) not in (None, "")}
        if len(values) > 1:
            raise ValueError(f"identity group has conflicting {field} values: {member_ids}")

    for field in _SCRIPTURE_FIELDS:
        values = {
            record.get(field)
            for record in member_records
            if record.get(field) not in (None, "", "unknown")
        }
        if len(values) > 1:
            raise ValueError(f"identity group has conflicting {field} claims: {member_ids}")

    for field in _SCALAR_COMPAT_FIELDS:
        values = {record.get(field) for record in member_records if record.get(field) not in (None, "")}
        if len(values) > 1:
            raise ValueError(f"identity group has conflicting {field} values: {member_ids}")

    def parent_identity(record):
        parent_id = record.get("parentId")
        if parent_id in (None, ""):
            return None
        if parent_id in records:
            return aliases_to_claim.get(parent_id, parent_id)
        if parent_id in alias_owner:
            return alias_owner[parent_id]
        raise ValueError(f"identity group references missing parent: {parent_id}")

    parent_ids = {parent_identity(record) for record in member_records}
    if len(parent_ids) > 1:
        raise ValueError(f"identity group has incompatible parents: {member_ids}")
    parent_id = next(iter(parent_ids)) if parent_ids else None
    if parent_id == group["canonicalId"]:
        raise ValueError(f"identity group would make a record its own parent: {member_ids}")
    if parent_id in records:
        parent_kind = records[parent_id].get("kind")
        kind = member_records[0].get("kind")
        if not _parent_kind_allowed(kind, parent_kind):
            raise ValueError(f"identity group has incompatible parent kind: {member_ids}")


def _parent_kind_allowed(kind, parent_kind):
    if kind == "dialect":
        return parent_kind in {"language", "dialect"}
    if kind == "people-group":
        return parent_kind in {"language", "dialect"}
    return parent_kind in {"language", "dialect"} or parent_kind is None


def _validate_final_parent_graph(records, groups, alias_owner):
    aliases = {}
    removed = set()
    for group in groups:
        removed.update(group["duplicateIds"])
        aliases.update(group["aliases"])

    parent_of = {}
    for record_id, record in records.items():
        if record_id in removed:
            continue
        parent_id = record.get("parentId")
        if parent_id in (None, ""):
            parent_of[record_id] = None
            continue
        parent_id = aliases.get(parent_id, alias_owner.get(parent_id, parent_id))
        if parent_id not in records or parent_id in removed:
            # A parent in a different group can only be valid if its current ID
            # is itself retained; aliases above handle duplicate parent IDs.
            raise ValueError(f"missing parent after reconciliation: {record_id} -> {parent_id}")
        parent_of[record_id] = parent_id
        if not _parent_kind_allowed(record.get("kind"), records[parent_id].get("kind")):
            raise ValueError(f"incompatible parent after reconciliation: {record_id} -> {parent_id}")

    visiting = set()
    visited = set()

    def visit(record_id):
        if record_id in visited:
            return
        if record_id in visiting:
            raise ValueError(f"parent cycle after reconciliation at: {record_id}")
        visiting.add(record_id)
        parent_id = parent_of.get(record_id)
        if parent_id is not None:
            visit(parent_id)
        visiting.remove(record_id)
        visited.add(record_id)

    for record_id in parent_of:
        visit(record_id)


def _apply_group(records, details, group):
    canonical_id = group["canonicalId"]
    canonical = records[canonical_id]
    duplicate_ids = group["duplicateIds"]

    alternate_ids = list(canonical.get("alternateIds", []))
    for duplicate_id in duplicate_ids:
        duplicate = records[duplicate_id]
        alternate_ids.extend([duplicate_id] + list(duplicate.get("alternateIds", [])))
        _merge_record(canonical, duplicate)
        _merge_detail(details, canonical_id, duplicate_id)
        records.pop(duplicate_id, None)
        details.pop(duplicate_id, None)

    canonical["id"] = canonical_id
    canonical["alternateIds"] = sorted(set(
        value for value in alternate_ids if value and value != canonical_id
    ))
    _add_reconciliation_metadata(details, canonical_id, group)


def _merge_record(canonical, duplicate):
    if duplicate.get("name") and duplicate.get("name") != canonical.get("name"):
        canonical.setdefault("aliases", []).append(duplicate["name"])
    canonical.setdefault("aliases", []).extend(duplicate.get("aliases", []))
    canonical.setdefault("sourceIds", []).extend(duplicate.get("sourceIds", []))
    canonical.setdefault("countryCodes", []).extend(duplicate.get("countryCodes", []))

    for field in _UNIQUE_FIELDS + ("family", "summary", "population", "languageContextStatus"):
        if canonical.get(field) in (None, "") and duplicate.get(field) not in (None, ""):
            canonical[field] = deepcopy(duplicate[field])

    if canonical.get("scriptureStatus") in (None, "", "unknown") and duplicate.get("scriptureStatus") not in (None, "", "unknown"):
        canonical["scriptureStatus"] = duplicate["scriptureStatus"]
    if canonical.get("scriptureScope") in (None, "", "unknown") and duplicate.get("scriptureScope") not in (None, "", "unknown"):
        canonical["scriptureScope"] = duplicate["scriptureScope"]
    canonical["needsReview"] = bool(canonical.get("needsReview") or duplicate.get("needsReview"))

    _merge_locations(canonical, duplicate, "location", "locations")
    _merge_list_field(canonical, duplicate, "spokenLocations")
    canonical["aliases"] = _unique_values(canonical.get("aliases", []))
    canonical["sourceIds"] = _unique_values(canonical.get("sourceIds", []))
    canonical["countryCodes"] = _unique_values(canonical.get("countryCodes", []))


def _merge_locations(canonical, duplicate, representative_field, collection_field):
    locations = []
    for record in (canonical, duplicate):
        representative = record.get(representative_field)
        if representative is not None and representative not in locations:
            locations.append(deepcopy(representative))
        for location in record.get(collection_field, []) or []:
            if location not in locations:
                locations.append(deepcopy(location))
    if not locations:
        return
    representative = canonical.get(representative_field)
    if representative is None:
        representative = locations[0]
    canonical[representative_field] = deepcopy(representative)
    if len(locations) > 1 or collection_field in canonical or collection_field in duplicate:
        canonical[collection_field] = locations


def _merge_list_field(canonical, duplicate, field):
    if field not in canonical and field not in duplicate:
        return
    values = list(canonical.get(field, []) or [])
    for value in duplicate.get(field, []) or []:
        if value not in values:
            values.append(deepcopy(value))
    canonical[field] = values


def _merge_detail(details, canonical_id, duplicate_id):
    canonical = details.setdefault(canonical_id, {"id": canonical_id})
    duplicate = details.get(duplicate_id, {})
    for field in _DETAIL_LIST_FIELDS:
        canonical.setdefault(field, [])
        for value in duplicate.get(field, []) or []:
            if value not in canonical[field]:
                canonical[field].append(deepcopy(value))
    for key, value in duplicate.items():
        if key == "id" or key in _DETAIL_LIST_FIELDS:
            continue
        if canonical.get(key) in (None, "", []):
            canonical[key] = deepcopy(value)
    canonical["id"] = canonical_id


def _add_reconciliation_metadata(details, canonical_id, group):
    detail = details.setdefault(canonical_id, {"id": canonical_id})
    detail.setdefault("notes", [])
    note = f"Reviewed identity reconciliation: {group['rationale']}"
    if note not in detail["notes"]:
        detail["notes"].append(note)
    detail.setdefault("links", [])
    detail.setdefault("evidence", [])
    for duplicate_id in group["duplicateIds"]:
        evidence = {
            "label": "Merged source record ID",
            "value": duplicate_id,
            "sourceId": "registry",
            "url": group["evidence"][0],
            "scope": "identity decision",
        }
        if evidence not in detail["evidence"]:
            detail["evidence"].append(evidence)
    for url in group["evidence"]:
        link = {"label": "Reviewed reconciliation evidence", "url": url, "sourceId": "registry"}
        if link not in detail["links"]:
            detail["links"].append(link)
        evidence = {
            "label": "Reviewed reconciliation evidence",
            "value": url,
            "sourceId": "registry",
            "url": url,
            "scope": "identity decision",
        }
        if evidence not in detail["evidence"]:
            detail["evidence"].append(evidence)


def _rewrite_references(records, details, aliases):
    for record in records.values():
        parent_id = record.get("parentId")
        if parent_id in aliases:
            record["parentId"] = aliases[parent_id]

    for owner_id, detail in details.items():
        related = detail.get("related", []) or []
        rewritten = []
        for row in related:
            row = deepcopy(row)
            related_id = row.get("id")
            if related_id in aliases:
                related_id = aliases[related_id]
                row["id"] = related_id
            if related_id == aliases.get(owner_id, owner_id):
                # Merging two related rows can otherwise leave a self-link on
                # the canonical detail entry.
                continue
            target = records.get(related_id)
            if not target:
                raise ValueError(f"dangling related ID after reconciliation: {owner_id} -> {related_id}")
            row["name"] = target.get("name", row.get("name"))
            row["kind"] = target.get("kind", row.get("kind"))
            if related_id and not any(
                existing.get("id") == related_id and existing.get("relationship") == row.get("relationship")
                for existing in rewritten
            ):
                rewritten.append(row)
        detail["related"] = rewritten


def _rewrite_mapping_values(mapping, aliases):
    for key, value in list(mapping.items()):
        if isinstance(value, str) and value in aliases:
            mapping[key] = aliases[value]
        elif isinstance(value, list):
            mapping[key] = [aliases.get(item, item) for item in value]
        elif isinstance(value, tuple):
            mapping[key] = tuple(aliases.get(item, item) for item in value)
        elif isinstance(value, set):
            mapping[key] = {aliases.get(item, item) for item in value}


def _identifier_map_names(builder):
    return [name for name in _IDENTIFIER_MAP_NAMES if hasattr(builder, name)]


def _is_http_url(value):
    if not isinstance(value, str):
        return False
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc) and not parsed.username and not parsed.password


def _unique_values(values):
    result = []
    for value in values:
        if value not in result:
            result.append(value)
    return result
