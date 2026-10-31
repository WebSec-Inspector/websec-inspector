"""Versioned migration contract; PostgreSQL tests use disposable schemas."""
import os
from pathlib import Path
import tempfile
import unittest
import uuid


class MigrationManifestTests(unittest.TestCase):
    def test_manifest_is_ordered_and_rejects_edited_history(self):
        from worker.schema_migrations import migration_manifest, validate_history
        manifest = migration_manifest()
        self.assertEqual([1, 2, 3], [item.version for item in manifest])
        validate_history(manifest, [(m.version, m.checksum) for m in manifest])
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            validate_history(manifest, [(1, "edited")])
        with self.assertRaisesRegex(RuntimeError, "newer|unknown"):
            validate_history(manifest, [(99, "unknown")])
        with self.assertRaisesRegex(RuntimeError, "gap|prefix"):
            validate_history(manifest, [(2, manifest[1].checksum)])


@unittest.skipUnless(os.getenv("TEST_POSTGRES_DSN"), "TEST_POSTGRES_DSN not configured")
class SchemaMigrationTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2 import sql
        self.conn = psycopg2.connect(os.environ["TEST_POSTGRES_DSN"])
        self.schema = "migration_" + uuid.uuid4().hex
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
            cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
        self.conn.commit()

    def tearDown(self):
        from psycopg2 import sql
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))
        self.conn.commit()
        self.conn.close()

    def migrate(self, **kwargs):
        from worker.schema_migrations import migrate
        return migrate(self.conn, **kwargs)

    def legacy(self, role="USER"):
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("DROP TABLE websec_schema_history")
            cur.execute("ALTER TABLE users DROP CONSTRAINT users_role_check")
            cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('legacy@example.invalid','same-hash','Legacy',%s,now())", (role,))
            cur.execute("ALTER TABLE findings DROP CONSTRAINT findings_severity_check")
            cur.execute("ALTER TABLE findings ADD CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))")
            cur.execute("INSERT INTO domains(user_id,hostname,verification_token) VALUES (1,'example.invalid','published-token')")
            cur.execute("INSERT INTO scans(domain_id,status,created_at) VALUES (1,'COMPLETED',now())")
            cur.execute("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity) VALUES(1,'legacy','keep',3,'LOW')")
        self.conn.commit()

    def test_empty_database_bootstraps_and_repeat_is_noop(self):
        self.assertEqual([1, 2, 3], self.migrate())
        self.assertEqual([], self.migrate())
        with self.conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM websec_schema_history")
            self.assertEqual(3, cur.fetchone()[0])

    def test_legacy_requires_explicit_adoption_and_preserves_data(self):
        self.legacy()
        with self.assertRaisesRegex(RuntimeError, "adopt"):
            self.migrate()
        self.assertEqual([1, 2, 3], self.migrate(adopt_legacy=True))
        with self.conn.cursor() as cur:
            cur.execute("SELECT password_hash,role FROM users")
            self.assertEqual([('same-hash', 'CLIENTE')], cur.fetchall())
            cur.execute("SELECT verification_token FROM domains")
            self.assertEqual('published-token', cur.fetchone()[0])
            cur.execute("SELECT description FROM findings")
            self.assertEqual('keep', cur.fetchone()[0])
            cur.execute("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity,evidence) VALUES (1,'new',%s,0,'INFORMATIONAL',%s)", ('d'*6001, 'e'*6001))
        self.conn.commit()

    def test_unknown_role_rolls_back_everything(self):
        self.legacy('UNKNOWN')
        with self.assertRaises(Exception):
            self.migrate(adopt_legacy=True)
        with self.conn.cursor() as cur:
            cur.execute("SELECT role FROM users")
            self.assertEqual('UNKNOWN', cur.fetchone()[0])
            cur.execute("SELECT to_regclass('websec_schema_history')")
            self.assertIsNone(cur.fetchone()[0])

    def test_partial_unknown_schema_is_not_adopted(self):
        with self.conn.cursor() as cur:
            cur.execute("CREATE TABLE users (id bigint PRIMARY KEY)")
        self.conn.commit()
        with self.assertRaisesRegex(RuntimeError, "schema|tables"):
            self.migrate(adopt_legacy=True)
        with self.conn.cursor() as cur:
            cur.execute("SELECT to_regclass('websec_schema_history')")
            self.assertIsNone(cur.fetchone()[0])

    def test_edited_sql_and_newer_database_block_startup(self):
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("UPDATE websec_schema_history SET checksum='changed' WHERE version=1")
        self.conn.commit()
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            self.migrate()

    def test_complete_legacy_with_wrong_type_or_missing_fk_is_rejected(self):
        self.legacy()
        with self.conn.cursor() as cur:
            cur.execute('ALTER TABLE users ALTER COLUMN name TYPE integer USING 1')
        self.conn.commit()
        with self.assertRaisesRegex(RuntimeError, 'type'):
            self.migrate(adopt_legacy=True)
        with self.conn.cursor() as cur:
            cur.execute("SELECT to_regclass('websec_schema_history')")
            self.assertIsNone(cur.fetchone()[0])
            cur.execute('ALTER TABLE users ALTER COLUMN name TYPE varchar(255) USING name::text')
            cur.execute('ALTER TABLE domains DROP CONSTRAINT domains_user_id_fkey')
        self.conn.commit()
        with self.assertRaisesRegex(RuntimeError, 'constraint'):
            self.migrate(adopt_legacy=True)
        with self.conn.cursor() as cur:
            cur.execute("SELECT to_regclass('websec_schema_history')")
            self.assertIsNone(cur.fetchone()[0])


if __name__ == '__main__':
    unittest.main()
