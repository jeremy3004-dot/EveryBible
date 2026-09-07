import copy
import unittest
from types import SimpleNamespace

from reconciliation import reconcile_records


SOURCE_URL = "https://example.org/review/crosswalk"


def record(record_id, *, kind="dialect", name="Variety", parent=None, iso="abc",
           glottocode=None, rolv=None, scripture="unknown", scope="unknown",
           source="source"):
    return {
        "id": record_id,
        "kind": kind,
        "name": name,
        "aliases": [],
        "iso6393": iso,
        "glottocode": glottocode,
        "rolvCode": rolv,
        "parentId": parent,
        "family": None,
        "countryCodes": [],
        "population": None,
        "scriptureStatus": scripture,
        "scriptureScope": scope,
        "languageContextStatus": None,
        "location": None,
        "sourceIds": [source],
        "summary": "",
        "needsReview": False,
    }


def detail(record_id, **overrides):
    value = {
        "id": record_id,
        "biography": "",
        "evidence": [],
        "related": [],
        "notes": [],
        "links": [],
    }
    value.update(overrides)
    return value


def builder(records, details=None):
    return SimpleNamespace(
        records=records,
        details=details or {record_id: detail(record_id) for record_id in records},
        glottolog_ids={},
        iso_ids={},
        el_ids={},
        report={},
    )


def decision(canonical, duplicates, rationale="Reviewed source identity", evidence=None):
    return {
        "canonicalId": canonical,
        "duplicateIds": list(duplicates),
        "rationale": rationale,
        "evidence": [SOURCE_URL] if evidence is None else evidence,
    }


class ReconciliationTests(unittest.TestCase):
    def test_glottolog_dialect_merges_into_rolv_without_losing_provenance(self):
        canonical = record("rolv:01234", name="ROLV label", rolv="01234", source="grn")
        canonical["aliases"] = ["Saved label"]
        canonical["countryCodes"] = ["NP"]
        canonical["location"] = {"latitude": 27, "longitude": 85, "sourceId": "grn"}
        canonical["locations"] = [canonical["location"]]
        canonical["spokenLocations"] = [{"label": "Dolpo", "countryCode": "NP", "sourceId": "grn"}]
        duplicate = record("glottolog:abcd1234", name="Glottolog label", glottocode="abcd1234", source="glottolog")
        duplicate["countryCodes"] = ["IN"]
        duplicate["location"] = {"latitude": 28, "longitude": 84, "sourceId": "glottolog"}
        duplicate["spokenLocations"] = [{"label": "Himachal", "countryCode": "IN", "sourceId": "glottolog"}]
        details = {
            "rolv:01234": detail(
                "rolv:01234",
                related=[{"id": "glottolog:abcd1234", "name": "Glottolog label", "kind": "dialect", "relationship": "Possible duplicate"}],
                links=[{"label": "ROLV", "url": "https://globalrecordings.net/en/language/01234", "sourceId": "grn"}],
            ),
            "glottolog:abcd1234": detail(
                "glottolog:abcd1234",
                evidence=[{"label": "Glottocode", "value": "abcd1234", "sourceId": "glottolog", "url": "https://glottolog.org/resource/languoid/id/abcd1234"}],
                related=[{"id": "iso:abc", "name": "ABC", "kind": "language", "relationship": "Parent classification"}],
                notes=["Glottolog note"],
                links=[{"label": "Glottolog", "url": "https://glottolog.org/resource/languoid/id/abcd1234", "sourceId": "glottolog"}],
            ),
            "iso:abc": detail("iso:abc"),
        }
        value = builder({"rolv:01234": canonical, "glottolog:abcd1234": duplicate, "iso:abc": record("iso:abc", kind="language", name="ABC")}, details)
        value.records["rolv:01234"]["parentId"] = "iso:abc"
        value.records["glottolog:abcd1234"]["parentId"] = "iso:abc"
        value.glottolog_ids["abcd1234"] = "glottolog:abcd1234"
        value.iso_ids["abc"] = "iso:abc"

        report = reconcile_records(value, [decision("rolv:01234", ["glottolog:abcd1234"])])

        merged = value.records["rolv:01234"]
        self.assertNotIn("glottolog:abcd1234", value.records)
        self.assertEqual(merged["alternateIds"], ["glottolog:abcd1234"])
        self.assertEqual(merged["glottocode"], "abcd1234")
        self.assertEqual(set(merged["sourceIds"]), {"grn", "glottolog"})
        self.assertEqual(set(merged["countryCodes"]), {"NP", "IN"})
        self.assertEqual(len(merged["locations"]), 2)
        self.assertEqual({item["sourceId"] for item in merged["spokenLocations"]}, {"grn", "glottolog"})
        self.assertEqual(value.glottolog_ids["abcd1234"], "rolv:01234")
        self.assertTrue(any(row["value"] == "abcd1234" for row in value.details["rolv:01234"]["evidence"]))
        self.assertIn("Glottolog note", value.details["rolv:01234"]["notes"])
        self.assertTrue(any(row["url"] == "https://glottolog.org/resource/languoid/id/abcd1234" for row in value.details["rolv:01234"]["links"]))
        self.assertEqual(value.details["rolv:01234"]["related"], [{"id": "iso:abc", "name": "ABC", "kind": "language", "relationship": "Parent classification"}])
        self.assertEqual(report["mergedCount"], 1)

    def test_same_name_records_are_not_merged_without_a_decision(self):
        value = builder({
            "rolv:one": record("rolv:one", name="Same name", rolv="00001"),
            "rolv:two": record("rolv:two", name="Same name", rolv="00002"),
        })
        reconcile_records(value, [])
        self.assertEqual(set(value.records), {"rolv:one", "rolv:two"})

    def test_wrong_parent_is_rejected_atomically(self):
        value = builder({
            "parent:a": record("parent:a", kind="language", iso="aaa"),
            "parent:b": record("parent:b", kind="language", iso="bbb"),
            "rolv:one": record("rolv:one", parent="parent:a", rolv="00001"),
            "glottolog:one": record("glottolog:one", parent="parent:b", glottocode="abcd1234"),
        })
        before = copy.deepcopy(value.records)
        with self.assertRaisesRegex(ValueError, "incompatible parents"):
            reconcile_records(value, [decision("rolv:one", ["glottolog:one"])])
        self.assertEqual(value.records, before)

    def test_conflicting_ids_and_scripture_claims_are_rejected(self):
        value = builder({
            "language:a": record("language:a", kind="language", iso="aaa", scripture="bible", scope="language"),
            "language:b": record("language:b", kind="language", iso="bbb", scripture="nt", scope="language"),
        })
        before = copy.deepcopy(value.records)
        with self.assertRaisesRegex(ValueError, "conflicting iso6393"):
            reconcile_records(value, [decision("language:a", ["language:b"])])
        self.assertEqual(value.records, before)

        value.records["language:b"]["iso6393"] = "aaa"
        with self.assertRaisesRegex(ValueError, "conflicting scriptureStatus"):
            reconcile_records(value, [decision("language:a", ["language:b"])])
        self.assertEqual(value.records, before | {"language:b": {**before["language:b"], "iso6393": "aaa"}})

    def test_kind_mismatch_and_people_group_merges_fail_closed(self):
        value = builder({
            "language:a": record("language:a", kind="language"),
            "dialect:a": record("dialect:a", kind="dialect"),
        })
        with self.assertRaisesRegex(ValueError, "incompatible kinds"):
            reconcile_records(value, [decision("language:a", ["dialect:a"])])
        value = builder({
            "people:a": record("people:a", kind="people-group"),
            "people:b": record("people:b", kind="people-group"),
        })
        with self.assertRaisesRegex(ValueError, "unsupported kind"):
            reconcile_records(value, [decision("people:a", ["people:b"])])

    def test_unknown_dialect_scripture_is_preserved_and_parent_status_is_not_inherited(self):
        parent = record("language:abc", kind="language", name="ABC", scripture="bible", scope="language")
        first = record("rolv:00001", parent="language:abc", rolv="00001")
        second = record("glottolog:abcd", parent="language:abc", glottocode="abcd1234")
        value = builder({"language:abc": parent, "rolv:00001": first, "glottolog:abcd": second})
        reconcile_records(value, [decision("rolv:00001", ["glottolog:abcd"])])
        self.assertEqual(value.records["rolv:00001"]["scriptureStatus"], "unknown")
        self.assertEqual(value.records["rolv:00001"]["scriptureScope"], "unknown")
        self.assertEqual(value.records["rolv:00001"]["languageContextStatus"], None)

    def test_nested_parent_groups_resolve_independently_of_decision_order(self):
        records = {
            "iso:abc": record("iso:abc", kind="language", name="ABC", iso="abc"),
            "glottolog:lang": record("glottolog:lang", kind="language", name="ABC", iso="abc"),
            "rolv:00001": record("rolv:00001", parent="iso:abc", rolv="00001"),
            "glottolog:dial": record("glottolog:dial", parent="glottolog:lang", glottocode="abcd1234"),
        }
        value = builder(records)
        value.details["glottolog:dial"]["related"] = [{"id": "glottolog:lang", "name": "ABC", "kind": "language", "relationship": "Parent"}]
        reconcile_records(value, [
            decision("rolv:00001", ["glottolog:dial"]),
            decision("iso:abc", ["glottolog:lang"]),
        ])
        self.assertEqual(set(value.records), {"iso:abc", "rolv:00001"})
        self.assertEqual(value.records["rolv:00001"]["parentId"], "iso:abc")
        related = value.details["rolv:00001"]["related"]
        self.assertEqual(related, [{"id": "iso:abc", "name": "ABC", "kind": "language", "relationship": "Parent"}])

    def test_missing_ids_and_ambiguous_groups_fail_before_any_mutation(self):
        value = builder({
            "rolv:a": record("rolv:a", rolv="00001"),
            "rolv:b": record("rolv:b", rolv="00002"),
            "glottolog:x": record("glottolog:x", glottocode="abcd1234"),
        })
        before = copy.deepcopy(value.records)
        with self.assertRaisesRegex(ValueError, "multiple decision groups"):
            reconcile_records(value, [
                decision("rolv:a", ["glottolog:x"]),
                decision("rolv:b", ["glottolog:x"]),
            ])
        self.assertEqual(value.records, before)

    def test_empty_evidence_and_dangling_related_rows_fail_before_mutation(self):
        value = builder({
            "rolv:a": record("rolv:a", rolv="00001"),
            "glottolog:a": record("glottolog:a", glottocode="abcd1234"),
        })
        before = copy.deepcopy(value.records)
        with self.assertRaisesRegex(ValueError, "non-empty list"):
            reconcile_records(value, [decision("rolv:a", ["glottolog:a"], evidence=[])])
        self.assertEqual(value.records, before)
        with self.assertRaisesRegex(ValueError, "missing canonical"):
            reconcile_records(value, [decision("rolv:missing", ["glottolog:a"])])
        self.assertEqual(value.records, before)
        value.details["rolv:a"]["related"] = [{"id": "missing", "name": "Missing", "kind": "dialect", "relationship": "bad"}]
        with self.assertRaisesRegex(ValueError, "dangling related"):
            reconcile_records(value, [])
        self.assertEqual(value.records, before)

    def test_cycle_is_rejected(self):
        value = builder({
            "language:a": record("language:a", kind="language", parent="dialect:b", iso="aaa"),
            "dialect:b": record("dialect:b", parent="language:a", iso="aaa", rolv="00001"),
            "dialect:c": record("dialect:c", parent="language:a", iso="aaa", glottocode="abcd1234"),
        })
        with self.assertRaisesRegex(ValueError, "parent cycle"):
            reconcile_records(value, [decision("dialect:b", ["dialect:c"])])

    def test_repeating_a_completed_decision_is_idempotent_and_reports_stale_crosswalk(self):
        value = builder({
            "rolv:one": record("rolv:one", rolv="00001"),
            "glottolog:one": record("glottolog:one", glottocode="abcd1234"),
        })
        group = [decision("rolv:one", ["glottolog:one"])]
        reconcile_records(value, group)
        records_after_first = copy.deepcopy(value.records)
        details_after_first = copy.deepcopy(value.details)
        maps_after_first = copy.deepcopy(value.glottolog_ids)
        report = reconcile_records(value, group)
        self.assertEqual(value.records, records_after_first)
        self.assertEqual(value.details, details_after_first)
        self.assertEqual(value.glottolog_ids, maps_after_first)
        self.assertEqual(report["mergedGroups"], [])
        self.assertEqual(report["staleGroups"][0]["canonicalId"], "rolv:one")


if __name__ == "__main__":
    unittest.main()
