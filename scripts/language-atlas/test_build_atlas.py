import unittest

from build_atlas import AtlasBuilder, normalize_rolv, scripture_status, valid_coordinates, scoped_scripture, country_code
from everylanguage import enrich_everylanguage, add_location
from grn import enrich_grn


class SourceRules(unittest.TestCase):
    def test_rolv_identifiers_keep_five_digits(self):
        self.assertEqual(normalize_rolv(7262), "07262")
        self.assertEqual(normalize_rolv("07966"), "07966")
        self.assertIsNone(normalize_rolv(0))
        self.assertIsNone(normalize_rolv("eng"))

    def test_joshua_unspecified_is_not_translation_needed(self):
        self.assertEqual(scripture_status("0"), "unknown")
        self.assertEqual(scripture_status("1"), "needed")
        self.assertEqual(scripture_status("5"), "bible")
        self.assertEqual(scripture_status(None), "unknown")

    def test_parent_scripture_does_not_establish_dialect_coverage(self):
        self.assertEqual(scoped_scripture("dialect", "5"), ("unknown", "unknown", "bible"))
        self.assertEqual(scoped_scripture("language", "4"), ("nt", "language", None))
        self.assertEqual(scoped_scripture("people-group", "3"), ("portions", "primary-language", None))

    def test_coordinates_allow_equator_but_reject_missing_and_sentinels(self):
        self.assertTrue(valid_coordinates(0, 24))
        self.assertTrue(valid_coordinates(27, 0))
        for latitude, longitude in [(None, 5), ("", 5), (0, 0), (91, 5), (3, 181), (float('nan'), 3)]:
            self.assertFalse(valid_coordinates(latitude, longitude))

    def test_joshua_rog_codes_require_the_official_country_crosswalk(self):
        mapping = {"CH": "CN", "NP": "NP", "AG": "DZ"}
        self.assertEqual(country_code("CH", mapping), "CN")
        self.assertEqual(country_code("AG", mapping), "DZ")
        self.assertIsNone(country_code("ZZ", mapping))

    def test_everylanguage_dialects_are_not_merged_into_their_iso_parent(self):
        builder = AtlasBuilder({}, {"country_records": [], "language_records": []}, {}, [])
        parent_id = builder.ensure_language("eng", "English")
        builder.records[parent_id]["scriptureStatus"] = "bible"
        bundle = {
            "language-entities": [
                {"id": "language", "parent_id": None, "name": "English", "level": "language"},
                {"id": "dialect-a", "parent_id": "language", "name": "First variety", "level": "dialect"},
                {"id": "dialect-b", "parent_id": "language", "name": "Second variety", "level": "dialect"},
            ],
            "language-entity-sources": [{"language_entity_id": "language", "source": "SIL", "external_id_type": "iso-639-3", "external_id": "eng", "version": "2025"}],
            "language-stats": [
                {"language_entity_id": "dialect-a", "iso639_3": "eng", "bible_status": 5},
                {"language_entity_id": "dialect-b", "iso639_3": "eng", "bible_status": 5},
            ],
            "language-coordinates": [
                {"language_entity_id": "dialect-a", "latitude": 27, "longitude": 85, "region_id": "np", "region_name": "Nepal", "location_source": "GRN"},
                {"language_entity_id": "dialect-a", "latitude": 26, "longitude": 84, "region_id": "np", "region_name": "Nepal", "location_source": "GRN"},
            ],
        }
        enrich_everylanguage(builder, bundle)
        self.assertEqual(len(builder.records), 3)
        for source_id in ["dialect-a", "dialect-b"]:
            record = builder.records[builder.el_ids[source_id]]
            self.assertEqual(record["parentId"], parent_id)
            self.assertEqual(record["scriptureStatus"], "unknown")
            self.assertEqual(record["languageContextStatus"], "bible")
        first = builder.records[builder.el_ids["dialect-a"]]
        self.assertEqual(len(first["locations"]), 2)
        index, _, _ = builder.finish([], "2026-09-05")
        dialect = next(row for row in index["records"] if row["id"] == first["id"])
        self.assertNotIn("Glottolog", dialect["summary"])

    def test_explicit_country_conflicts_keep_both_values_for_review(self):
        builder = AtlasBuilder({}, {"country_records": [{"rog3": "WI", "iso2": "EH"}], "language_records": []}, {}, [])
        bundle = {
            "language-entities": [{"id": "variety", "parent_id": None, "name": "Example", "level": "dialect"}],
            "region-stats": [{"region_id": "western-sahara", "region_name": "W. Sahara", "iso2": "PS"}],
            "people-groups-regions": [{"people_group_id": "people", "region_id": "western-sahara", "people_id3_rog3": "12345WI"}],
            "language-entities-regions": [{"language_entity_id": "variety", "region_id": "western-sahara"}],
        }
        enrich_everylanguage(builder, bundle)
        record = builder.records["el:variety"]
        self.assertEqual(record["countryCodes"], ["EH"])
        self.assertTrue(record["needsReview"])
        values = {row["value"] for row in builder.details[record["id"]]["evidence"]}
        self.assertTrue({"PS", "EH"}.issubset(values))

    def test_shared_coordinates_preserve_each_provider_location(self):
        builder = AtlasBuilder({}, {"country_records": [], "language_records": []}, {}, [])
        record = builder.add("iso:ctm", "Chitimacha", "language", "glottolog")
        builder.place(record, 30.3386, -90.9123, "language-area", "glottolog", "Glottolog", "US")
        add_location(builder, record, 30.3386, -90.9123, "language-area", "Every Language: United States", "US")
        self.assertEqual({point["sourceId"] for point in record["locations"]}, {"everylanguage", "glottolog"})

    def test_grn_language_number_does_not_merge_historical_dialect_into_language(self):
        builder = AtlasBuilder({}, {"country_records": [], "language_records": []}, {}, [])
        language = builder.ensure_language("jgk", "Jarawan Bununu")
        builder.grn_ids = {"1961": language}
        row = {"scope": "Dialect", "rolv_code_exact": None, "grn_language_number": 1961,
               "iso639_3": "jgk", "objectid": 774, "grn_name": "Jarawan Bununu", "state": "Verified",
               "source_coordinates": None, "attribute_coordinates": None, "source_id": "grnmapapp:774"}
        enrich_grn(builder, {}, {"rows": [row]})
        self.assertIn("grnmap:774", builder.records)
        self.assertEqual(builder.records["grnmap:774"]["kind"], "dialect")
        self.assertNotIn("grn-map", builder.records[language]["sourceIds"])


if __name__ == '__main__':
    unittest.main()
