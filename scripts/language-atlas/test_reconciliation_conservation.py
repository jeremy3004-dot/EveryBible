"""Regression coverage for the independent conservation gate."""
import copy
import unittest

from verify_reconciliation_conservation import verify


def record(identifier="one", **fields):
    return {"id": identifier, "kind": "dialect", "aliases": ["Old name"], "sourceIds": ["registry"], "scriptureStatus": "unknown", "scriptureScope": "unknown", "languageContextStatus": "unknown", **fields}


def check(before, after):
    return verify({"records": before}, {"records": after})


class ConservationTests(unittest.TestCase):
    def test_merged_identity_and_relocated_source_point_pass(self):
        point = {"latitude": 1, "longitude": 2, "precision": "source", "label": "Original"}
        original = record(alternateIds=["older"], location=point)
        merged = record("canonical", alternateIds=["one", "older"], locations=[point])
        self.assertTrue(check([original], [merged])["ok"])

    def test_duplicate_owner_and_split_identity_fail(self):
        original = record(alternateIds=["older"])
        for after in ([original, record("two", alternateIds=["one"])], [record(), record("older")], []):
            self.assertFalse(check([original], after)["ok"])

    def test_each_conserved_field_is_checked(self):
        original = record()
        for field, value in [("scriptureStatus", "full-bible"), ("scriptureScope", "exact"), ("languageContextStatus", "full-bible"), ("aliases", []), ("sourceIds", [])]:
            changed = {**original, field: value}
            with self.subTest(field=field):
                self.assertFalse(check([original], [changed])["ok"])

    def test_point_metadata_loss_fails_but_derived_points_can_change(self):
        for precision in ("source", "parent-language", "related-people-group", "country"):
            original = record(location={"latitude": 1, "longitude": 2, "precision": precision, "label": "Source"})
            changed = copy.deepcopy(original)
            changed["location"]["label"] = "Changed"
            self.assertEqual(check([original], [changed])["ok"], precision != "source")

    def test_derived_attribution_requires_detail_audit_but_real_source_loss_fails(self):
        point = {"precision": "country", "sourceId": "countries"}
        old = record(sourceIds=["registry", "countries"], location=point)
        new = record()
        result = check([old], [new])
        self.assertTrue(result["ok"])
        self.assertTrue(result["derivedOnlySourceAttributionChanges"][0]["requiresOriginalDetailEvidenceAudit"])
        for real in ({"precision": "source", "sourceId": "countries"},):
            old["locations"] = [real]
            new["locations"] = [real]
            self.assertFalse(check([old], [new])["ok"])
        self.assertFalse(check([record(sourceIds=["registry", "countries"])], [record()])["ok"])

    def test_people_groups_must_be_identical(self):
        original = record(kind="people-group")
        self.assertTrue(check([original], [original])["ok"])
        self.assertFalse(check([original], [{**original, "name": "Changed"}])["ok"])
        self.assertFalse(check([], [original])["ok"])


if __name__ == "__main__":
    unittest.main()
