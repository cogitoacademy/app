import hashlib
import unittest

from audit import audit, prepare, single_text, verify_asset


class AuditTest(unittest.TestCase):
    def test_distinct_ids_are_preserved_and_missing_refs_reported(self):
        docs = [{"_id": identity, "_type": "competition", "title": [{"_key": "en", "value": "Same title"}], "eventDate": {"startDate": "2026-10-01T01:00:00Z", "endDate": "2026-10-03T13:00:00Z"}, "categories": [{"_ref": "missing"}]} for identity in ("a", "b")]
        result = audit(docs)
        self.assertEqual(result["counts"]["competition"], 2)
        self.assertEqual([issue["id"] for issue in result["issues"]], ["a", "b"])

    def test_invalid_range_missing_locale_and_resource_file(self):
        result = audit([{"_id": "a", "_type": "competition", "eventDate": {"startDate": "2026-10-03", "endDate": "2026-10-01"}}, {"_id": "b", "_type": "studentResource"}])
        self.assertEqual({issue["issue"] for issue in result["issues"]}, {"invalid_date_range", "missing_title", "missing_resource_file"})

    def test_single_input_preserves_non_english_and_legacy_display(self):
        self.assertEqual(single_text("Materi Bahasa Indonesia"), "Materi Bahasa Indonesia")
        self.assertEqual(single_text([{"_key": "id", "value": "Lomba"}]), "Lomba")
        self.assertEqual(single_text([{"_key": "id", "value": "Lomba"}, {"_key": "en", "value": "Contest"}]), "Contest")
        self.assertEqual(single_text([{"_key": "en", "value": " "}, {"_key": "id", "value": "Lomba"}]), "Lomba")
        self.assertIsNone(single_text([]))

    def test_prepared_resources_require_verified_file_and_preserve_id(self):
        doc = {"_id": "legacy-id", "_type": "studentResource", "title": "Materi", "category": "other"}
        with self.assertRaises(ValueError):
            prepare([doc], [])
        asset = {"resourceId": "legacy-id", "status": "verified", "assetId": "file-id", "file": "a.pdf", "bytes": 3, "sha256": "digest"}
        result = prepare([doc], [asset])
        self.assertEqual(result["resources"][0]["id"], "legacy-id")
        self.assertEqual(result["resources"][0]["title"], "Materi")

    def test_corrupt_same_size_asset_rejected(self):
        asset = {"size": 3, "sha1hash": hashlib.sha1(b"pdf").hexdigest()}
        self.assertEqual(verify_asset(b"pdf", asset), hashlib.sha256(b"pdf").hexdigest())
        with self.assertRaises(ValueError):
            verify_asset(b"bad", asset)
        with self.assertRaises(ValueError):
            verify_asset(b"", asset)

    def test_timestamp_order_compares_instants_not_strings(self):
        doc = {"_id": "a", "_type": "competition", "title": [{"_key": "en", "value": "Event"}], "eventDate": {"startDate": "2026-10-01T08:00:00+07:00", "endDate": "2026-10-01T02:00:00Z"}}
        self.assertEqual(audit([doc])["issues"], [])
        doc["eventDate"]["endDate"] = "2026-10-01T00:00:00Z"
        self.assertEqual(audit([doc])["issues"][0]["issue"], "invalid_date_range")


if __name__ == "__main__":
    unittest.main()
