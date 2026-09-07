#!/usr/bin/env python3
"""Verify identity and source-evidence conservation between two atlas indexes.

This index-only check reports derived-only source attribution changes separately.
An ok result with such changes is conditional on independently checking original
record details: the removed source must have no evidence beyond the derived map
placement. The index cannot prove that detail-evidence condition itself.

Usage: python3 scripts/language-atlas/verify_reconciliation_conservation.py \
    --before before.json.gz --after after.json.gz
"""

import argparse
import gzip
import json
import sys
from collections import Counter, defaultdict

DERIVED_PRECISIONS = {"parent-language", "related-people-group", "country"}
STATUS_FIELDS = ("scriptureStatus", "scriptureScope", "languageContextStatus")


def source_positions(record):
    """Compare complete point dictionaries, regardless of representative placement."""
    points = list(record.get("locations") or []) + list(record.get("spokenLocations") or [])
    if record.get("location") is not None:
        points.append(record["location"])
    return [point for point in points if point.get("precision") not in DERIVED_PRECISIONS]


def verify(before, after):
    originals, current = before["records"], after["records"]
    owners = defaultdict(set)
    for index, record in enumerate(current):
        for identifier in [record["id"], *(record.get("alternateIds") or [])]:
            owners[identifier].add(index)
    errors = []
    derived_changes = []
    checked_ids = set()
    for original in originals:
        resolved = set()
        for identifier in [original["id"], *(original.get("alternateIds") or [])]:
            checked_ids.add(identifier)
            matches = owners[identifier]
            if len(matches) != 1:
                errors.append({"id": identifier, "check": "unique-owner", "owners": [current[i]["id"] for i in sorted(matches)]})
            resolved.update(matches)
        if len(resolved) != 1:
            if len(resolved) > 1:
                errors.append({"id": original["id"], "check": "split-identity", "owners": [current[i]["id"] for i in sorted(resolved)]})
            continue
        owner = current[next(iter(resolved))]
        for field in STATUS_FIELDS:
            if original.get(field) != owner.get(field):
                errors.append({"id": original["id"], "owner": owner["id"], "check": field, "before": original.get(field), "after": owner.get(field)})
        for field in ("aliases", "sourceIds"):
            missing = sorted(set(original.get(field) or []) - set(owner.get(field) or []))
            if field == "sourceIds":
                # Index-only classification: callers must separately audit original
                # detail evidence before accepting these attribution changes.
                points = ([original["location"]] if original.get("location") else []) + list(original.get("locations") or []) + list(original.get("spokenLocations") or [])
                derived_sources = {point.get("sourceId") for point in points if point.get("precision") in DERIVED_PRECISIONS}
                real_sources = {point.get("sourceId") for point in source_positions(original) + source_positions(owner)}
                derived_only = [source for source in missing if source in derived_sources and source not in real_sources]
                if derived_only:
                    derived_changes.append({"id": original["id"], "owner": owner["id"], "sourceIds": derived_only, "requiresOriginalDetailEvidenceAudit": True})
                missing = [source for source in missing if source not in derived_only]
            if missing:
                errors.append({"id": original["id"], "owner": owner["id"], "check": field, "missing": missing})
        retained = source_positions(owner)
        missing_points = [point for point in source_positions(original) if point not in retained]
        if missing_points:
            errors.append({"id": original["id"], "owner": owner["id"], "check": "source-positions", "missing": missing_points})
    # Exact whole-record comparison also catches additions and duplicate people groups.
    people = lambda rows: Counter(json.dumps(row, sort_keys=True) for row in rows if row.get("kind") == "people-group")
    old_people, new_people = people(originals), people(current)
    if old_people != new_people:
        errors.append({"check": "people-groups-identical", "removedOrChanged": [json.loads(row) for row in (old_people - new_people).elements()], "addedOrChanged": [json.loads(row) for row in (new_people - old_people).elements()]})
    return {"ok": not errors, "beforeRecords": len(originals), "afterRecords": len(current), "originalIdentifiersChecked": len(checked_ids), "peopleGroupsChecked": sum(old_people.values()), "derivedOnlySourceAttributionChanges": derived_changes, "errors": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True, help="Original gzip JSON atlas index")
    parser.add_argument("--after", required=True, help="Reconciled gzip JSON atlas index")
    args = parser.parse_args()
    try:
        with gzip.open(args.before, "rt", encoding="utf-8") as handle:
            before = json.load(handle)
        with gzip.open(args.after, "rt", encoding="utf-8") as handle:
            after = json.load(handle)
        result = verify(before, after)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
