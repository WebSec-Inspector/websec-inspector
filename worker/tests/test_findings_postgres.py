"""Migration and persistence checks against a disposable PostgreSQL schema."""
import os
from pathlib import Path
import unittest
import uuid

from worker.finding_service import save_findings
from worker.zap_parser import parse_zap_alerts


@unittest.skipUnless(os.getenv("TEST_POSTGRES_DSN"), "TEST_POSTGRES_DSN not configured")
class FindingsPostgresTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2 import sql

        self.conn = psycopg2.connect(os.environ["TEST_POSTGRES_DSN"])
        self.schema = "review_" + uuid.uuid4().hex
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
            cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
            cur.execute("""
                CREATE TABLE scans (id bigint PRIMARY KEY);
                CREATE TABLE findings (
                    id bigserial PRIMARY KEY, scan_id bigint NOT NULL REFERENCES scans(id),
                    owasp_category varchar(255) NOT NULL, description varchar(2000) NOT NULL,
                    cvss_score double precision NOT NULL, severity varchar(255) NOT NULL
                      CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
                    recommendation varchar(2000)
                );
                INSERT INTO scans VALUES (42);
                INSERT INTO findings (scan_id, owasp_category, description, cvss_score, severity)
                VALUES (42, 'legacy', 'Existing finding', 3.0, 'LOW');
            """)
        self.conn.commit()

    def tearDown(self):
        from psycopg2 import sql

        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))
        self.conn.commit()
        self.conn.close()

    def migrate(self):
        migration = Path(__file__).resolve().parents[2] / "infra/migrations/20261021-zap-findings.sql"
        with self.conn.cursor() as cur:
            cur.execute(migration.read_text(encoding="utf-8"))

    def test_migration_preserves_data_and_supports_long_informational_findings(self):
        self.migrate()
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("SELECT id, description FROM findings")
            self.assertEqual([(1, "Existing finding")], cur.fetchall())

        alert = {"alert": "A" * 300, "risk": "Informational", "evidence": "x" * 6000,
                 "description": "d" * 6000, "solution": "s" * 6000,
                 "reference": "r" * 6000, "url": "https://example.com/" + "u" * 3000,
                 "param": "p" * 1500}
        findings = parse_zap_alerts([alert])
        save_findings(self.conn, 42, findings)
        save_findings(self.conn, 42, findings)
        with self.conn.cursor() as cur:
            cur.execute("SELECT severity, evidence, description FROM findings WHERE scan_id = 42")
            self.assertEqual([("INFORMATIONAL", "x" * 6000, "d" * 6000)], cur.fetchall())

    def test_failed_replacement_keeps_previous_findings(self):
        self.migrate()
        valid = parse_zap_alerts([{"alert": "Valid", "risk": "Low"}])[0]
        with self.assertRaises(KeyError):
            save_findings(self.conn, 42, [valid, {}])
        with self.conn.cursor() as cur:
            cur.execute("SELECT description FROM findings WHERE scan_id = 42")
            self.assertEqual([("Existing finding",)], cur.fetchall())
