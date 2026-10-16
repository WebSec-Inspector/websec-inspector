import unittest

from worker.finding_service import save_findings
from worker.zap_parser import ZapParsingError, parse_zap_alerts


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.result = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, query, params):
        if query.startswith("SELECT 1 FROM scans"):
            self.result = (1,) if params[0] in self.connection.scans else None
        elif query.startswith("DELETE FROM findings"):
            self.connection.findings = [
                row for row in self.connection.findings if row["scan_id"] != params[0]
            ]
        elif query.startswith("INSERT INTO findings"):
            self.connection.findings.append({"scan_id": params[0], "values": params[1:]})

    def fetchone(self):
        return self.result


class FakeConnection:
    def __init__(self):
        self.scans = {42}
        self.findings = []
        self.previous_findings = None

    def __enter__(self):
        self.previous_findings = list(self.findings)
        return self

    def __exit__(self, exception_type, *_):
        if exception_type:
            self.findings = self.previous_findings
        return False

    def cursor(self):
        return FakeCursor(self)


class ZapParserTests(unittest.TestCase):
    def test_parses_all_zap_risk_levels(self):
        alerts = [
            {"alert": "High issue", "risk": "High"},
            {"alert": "Medium issue", "risk": "Medium"},
            {"alert": "Low issue", "risk": "Low"},
            {"alert": "Info issue", "risk": "Informational"},
        ]

        findings = parse_zap_alerts(alerts)

        self.assertEqual(
            ["HIGH", "MEDIUM", "LOW", "INFORMATIONAL"],
            [finding["severity"] for finding in findings],
        )

    def test_empty_alert_list_is_valid(self):
        self.assertEqual([], parse_zap_alerts([]))

    def test_missing_optional_fields_are_none(self):
        finding = parse_zap_alerts([{"alert": "Issue", "risk": "Low"}])[0]

        self.assertIsNone(finding["affected_parameter"])
        self.assertIsNone(finding["evidence"])
        self.assertIsNone(finding["technical_reference"])
        self.assertIsNone(finding["confidence"])

    def test_invalid_response_and_required_fields_are_rejected(self):
        for response in (None, {}, [{"risk": "High"}], [{"alert": "Issue"}]):
            with self.subTest(response=response), self.assertRaises(ZapParsingError):
                parse_zap_alerts(response)

    def test_persistence_reprocessing_replaces_prior_findings(self):
        connection = FakeConnection()
        finding = parse_zap_alerts([{"alert": "Issue", "risk": "High"}])[0]

        save_findings(connection, 42, [finding])
        save_findings(connection, 42, [finding])

        self.assertEqual(1, len(connection.findings))
        self.assertEqual(42, connection.findings[0]["scan_id"])

    def test_persistence_rejects_unknown_scan(self):
        with self.assertRaisesRegex(ValueError, "Scan 404 does not exist"):
            save_findings(FakeConnection(), 404, [])


if __name__ == "__main__":
    unittest.main()