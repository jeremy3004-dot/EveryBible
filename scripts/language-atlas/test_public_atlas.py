import copy
import unittest

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

    def test_source_urls_cannot_publish_credentials_or_unsafe_schemes(self):
        for url in ("javascript:alert(1)", "file:///private/source", "https://user:password@example.com"):
            source = self.fixture()
            source["sources"][0]["url"] = url
            with self.assertRaises(ValueError):
                public_projection(source)


if __name__ == '__main__':
    unittest.main()
