import copy
import unittest
import build_public_atlas

from build_public_atlas import public_projection


class PublicBoundary(unittest.TestCase):
    def fixture(self):
        return {
            "schemaVersion": 1, "generatedAt": "2026-09-05",
            "records": [{"id": "dialect:a", "kind": "dialect", "name": "Variety",
                "scriptureStatus": "unknown", "scriptureScope": "unknown",
                "languageContextStatus": "bible", "secret": "private",
                "location": {"latitude": 27, "longitude": 85, "precision": "parent-language",
                    "sourceId": "glottolog", "label": "Approximate", "countryCode": "NP",
                    "contact": "private"},
                "locations": [{"latitude": 28, "longitude": 84, "precision": "dialect-area",
                    "sourceId": "glottolog", "label": "Reference", "countryCode": "NP"}]}],
            "sources": [{"id": "glottolog", "url": "https://glottolog.org", "secret": "private"}],
            "countries": [{"code": "NP", "name": "Nepal", "secret": "private"}],
            "counts": {"records": 1, "secret": 99}, "notes": ["private"], "secret": "private",
        }

    def test_whitelist_removes_unknown_fields_at_every_boundary(self):
        result = public_projection(self.fixture())
        self.assertNotIn("private", str(result))
        self.assertNotIn("secret", str(result))
        self.assertEqual(result["countries"], [{"code": "NP", "name": "Nepal"}])

    def test_projection_preserves_exact_scope_and_all_source_locations(self):
        source = self.fixture()
        before = copy.deepcopy(source)
        record = public_projection(source)["records"][0]
        self.assertEqual(record["scriptureStatus"], "unknown")
        self.assertEqual(record["languageContextStatus"], "bible")
        self.assertEqual(record["location"]["precision"], "parent-language")
        self.assertEqual(record["locations"][0]["latitude"], 28)
        self.assertEqual(source, before)

    def test_projection_draws_one_dot_where_sources_place_a_record_at_the_same_spot(self):
        # Glottolog and Every Language often supply the same reference point a
        # few metres apart; each list entry is a map dot, so the record showed
        # up twice in a cluster. Distinct places (other countries) stay.
        source = self.fixture()
        source["records"][0]["locations"] = [
            {"latitude": -12.8322, "longitude": -60.9716, "sourceId": "glottolog", "label": "Glottolog"},
            {"latitude": -12.832157, "longitude": -60.97156, "sourceId": "everylanguage", "label": "EL"},
            {"latitude": -12.95, "longitude": -61.05, "sourceId": "grn", "label": "Within 25 km"},
            {"latitude": -10.0, "longitude": -60.0, "sourceId": "everylanguage", "label": "Elsewhere"},
        ]
        before = copy.deepcopy(source)
        record = public_projection(source)["records"][0]
        self.assertEqual([point["label"] for point in record["locations"]], ["Glottolog", "Elsewhere"])
        self.assertEqual(source, before)

    def test_projection_hides_a_dialect_dot_that_repeats_a_nearby_same_named_record(self):
        # Sources disagree on classification: one lists "Adang" as a language,
        # another as its dialect at the same spot, so the globe showed the name
        # twice. The dialect stays in the data and search, without its own dot.
        def rec(record_id, kind, name, latitude, parent=None):
            point = {"latitude": latitude, "longitude": 124.0, "sourceId": "glottolog", "label": record_id}
            return {"id": record_id, "kind": kind, "name": name, "parentId": parent,
                    "scriptureStatus": "unknown", "scriptureScope": "unknown",
                    "location": point, "locations": [point]}
        source = self.fixture()
        source["records"] = [
            rec("dialect:adang", "dialect", "Adang", -8.19, "iso:adn"),
            rec("iso:adn", "language", "Adang", -8.20),
            rec("dialect:penukal", "dialect", "Abab: Penukal", -3.0, "iso:abab"),
            rec("glottolog:penukal", "dialect", "Penukal", -3.05, "glottolog:musi"),
            rec("dialect:far", "dialect", "Adang", -1.0, "iso:other"),
            rec("rolv:aro-east", "dialect", "Aro: East", 5.0, "iso:aro"),
            rec("rolv:kombio-east", "dialect", "Kombio: East", 5.01, "iso:kombio"),
            rec("iso:nbf", "language", "Naxi", 27.0),
            rec("iso:nxq", "language", "Naxi", 27.01),
            rec("iso:ste", "language", "Liana-Seti", -3.0 + 40),
            rec("rolv:12925", "dialect", "Liana Seti", -3.01 + 40, "iso:ste"),
            rec("iso:baz", "language", "Tunen", 4.7),
            rec("iso:tvu", "language", "Tunen", 4.71),
        ]
        # A retired ISO code kept only as a Glottolog "Bookkeeping" reference
        # row repeats the current language; it gives up its dot. Two current
        # languages that share a name (Naxi above) both stay.
        source["records"][-2].update(family="Bookkeeping", needsReview=True, sourceIds=["glottolog", "registry"])
        source["records"][-1].update(sourceIds=["everylanguage", "glottolog", "registry"])
        before = copy.deepcopy(source)
        records = {record["id"]: record for record in public_projection(source)["records"]}
        hidden = {record_id for record_id, record in records.items() if record["location"] is None}
        self.assertEqual(hidden, {"dialect:adang", "glottolog:penukal", "rolv:12925", "iso:baz"})
        self.assertNotIn("locations", records["dialect:adang"])
        self.assertEqual(records["dialect:adang"]["name"], "Adang")
        self.assertEqual(source, before)

    def test_projection_allowlists_exact_spoken_locations(self):
        source = self.fixture()
        source["records"][0]["spokenLocations"] = [{
            "label": "Nepal, Bagmati", "countryCode": "NP", "sourceId": "grn", "private": "drop",
        }]
        record = public_projection(source)["records"][0]
        self.assertEqual(record["spokenLocations"], [{
            "label": "Nepal, Bagmati", "countryCode": "NP", "sourceId": "grn",
        }])

    def test_projection_retains_reconciled_identifiers(self):
        source = self.fixture()
        source["records"][0]["alternateIds"] = ["glottolog:paac1238"]
        self.assertEqual(public_projection(source)["records"][0].get("alternateIds"),
                         ["glottolog:paac1238"])

    def test_source_urls_cannot_publish_credentials_or_unsafe_schemes(self):
        for url in ("javascript:alert(1)", "file:///private/source", "https://user:password@example.com"):
            source = self.fixture()
            source["sources"][0]["url"] = url
            with self.assertRaises(ValueError):
                public_projection(source)

    def test_startup_transport_keeps_complete_varieties_and_excludes_unused_people_groups(self):
        pack = getattr(build_public_atlas, "startup_projection", None)
        self.assertTrue(callable(pack), "a compact, lossless public startup projection is required")
        source = public_projection(self.fixture())
        source["records"].append({**source["records"][0], "id": "people:x", "kind": "people-group"})
        before = copy.deepcopy(source)
        packed = pack(source)
        self.assertEqual(packed["schemaVersion"], 2)
        self.assertEqual(len(packed["records"]), 1)
        row = packed["records"][0]
        fields = packed["recordFields"][row[0]]
        record = dict(zip(fields, row[1:]))
        self.assertEqual(record["id"], "dialect:a")
        self.assertEqual(record["scriptureScope"], "unknown")
        self.assertEqual(record["languageContextStatus"], "bible")
        location = packed["locations"][record["location"]]
        self.assertEqual(dict(zip(packed["locationFields"][location[0]], location[1:])), source["records"][0]["location"])
        self.assertEqual(source, before)

    def test_startup_transport_omits_the_generated_summary_the_public_map_never_shows(self):
        source = public_projection(self.fixture())
        source["records"][0]["summary"] = "Variety is a language variety."
        packed = build_public_atlas.startup_projection(source)
        self.assertNotIn("summary", {field for layout in packed["recordFields"] for field in layout})
        self.assertEqual(source["records"][0]["summary"], "Variety is a language variety.")

    def test_startup_transport_shares_identical_locations_without_losing_optional_fields(self):
        pack = getattr(build_public_atlas, "startup_projection", None)
        self.assertTrue(callable(pack), "a compact, lossless public startup projection is required")
        source = public_projection(self.fixture())
        source["records"][0]["locations"] = [source["records"][0]["location"]]
        source["records"].append({"id": "language:x", "kind": "language", "location": None})
        packed = pack(source)
        self.assertEqual(len(packed["locations"]), 1)
        row = packed["records"][0]
        record = dict(zip(packed["recordFields"][row[0]], row[1:]))
        self.assertEqual(record["locations"], [record["location"]])
        row = packed["records"][1]
        record = dict(zip(packed["recordFields"][row[0]], row[1:]))
        self.assertIsNone(record["location"])
        self.assertNotIn("locations", record)


if __name__ == '__main__':
    unittest.main()
