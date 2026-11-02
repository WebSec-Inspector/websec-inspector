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
        self.assertEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [item.version for item in manifest])
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
            cur.execute("DROP TABLE verification_challenges")
            cur.execute("DROP TABLE websec_schema_history")
            cur.execute("ALTER TABLE domains DROP COLUMN IF EXISTS is_active")
            cur.execute("ALTER TABLE users DROP CONSTRAINT users_role_check")
            cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('legacy@example.invalid','same-hash','Legacy',%s,now())", (role,))
            cur.execute("ALTER TABLE findings DROP CONSTRAINT findings_severity_check")
            cur.execute("ALTER TABLE findings ADD CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))")
            cur.execute("INSERT INTO domains(user_id,hostname,verification_token) VALUES (1,'example.invalid','published-token')")
            cur.execute("INSERT INTO scans(domain_id,status,created_at) VALUES (1,'COMPLETED',now())")
            cur.execute("INSERT INTO findings(scan_id,owasp_category,description,cvss_score,severity) VALUES(1,'legacy','keep',3,'LOW')")
        self.conn.commit()

    def test_upgrade_from_domain_archival_preserves_existing_report_and_owner(self):
        import shutil
        migrations=Path(__file__).resolve().parents[1]/'migrations'
        with tempfile.TemporaryDirectory() as folder:
            for path in migrations.glob('*.sql'):
                if int(path.name[:3])<=7:shutil.copyfile(path,Path(folder)/path.name)
            # Build the historical release from its immutable SQL. The latest
            # runtime validator intentionally rejects a schema below version 8.
            from worker.schema_migrations import migration_manifest
            with self.conn.cursor() as cur:
                cur.execute("CREATE TABLE websec_schema_history(version integer PRIMARY KEY,checksum varchar(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())")
                for migration in migration_manifest(folder):
                    cur.execute(migration.sql)
                    cur.execute("INSERT INTO websec_schema_history(version,checksum) VALUES (%s,%s)",(migration.version,migration.checksum))
            self.conn.commit()
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('preserved@example.invalid','same-hash','Owner','CLIENTE',now())")
            cur.execute("INSERT INTO domains(user_id,hostname,verification_token,is_active) VALUES (1,'example.invalid','published-token',false)")
            cur.execute("INSERT INTO scans(domain_id,status,created_at) VALUES (1,'COMPLETED',now())")
            cur.execute("INSERT INTO reports(scan_id,pdf_url,sent_at) VALUES (1,'/data/reports/scan-1.pdf',now()) RETURNING id,scan_id,pdf_url,sent_at")
            original=cur.fetchone()
        self.conn.commit()
        self.assertEqual([8,9,10],self.migrate())
        with self.conn.cursor() as cur:
            cur.execute('SELECT id,scan_id,pdf_url,sent_at FROM reports')
            self.assertEqual(original,cur.fetchone())
            cur.execute('SELECT status,attempt_count FROM reports')
            self.assertEqual(('PENDING',0),cur.fetchone())
            cur.execute('SELECT is_active,verification_token FROM domains')
            self.assertEqual((False,'published-token'),cur.fetchone())
            cur.execute('SELECT password_hash FROM users')
            self.assertEqual(('same-hash',),cur.fetchone())

    def test_empty_database_bootstraps_and_repeat_is_noop(self):
        self.assertEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], self.migrate())
        self.assertEqual([], self.migrate())
        with self.conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM websec_schema_history")
            self.assertEqual(10, cur.fetchone()[0])
            cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('new@example.invalid','hash','New','CLIENTE',now())")
            cur.execute("INSERT INTO domains(user_id,hostname,verification_token) VALUES (1,'new.example.invalid','new-token') RETURNING is_active")
            self.assertTrue(cur.fetchone()[0])

    def test_legacy_requires_explicit_adoption_and_preserves_data(self):
        self.legacy()
        with self.assertRaisesRegex(RuntimeError, "adopt"):
            self.migrate()
        self.assertEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], self.migrate(adopt_legacy=True))
        with self.conn.cursor() as cur:
            cur.execute("SELECT password_hash,role FROM users")
            self.assertEqual([('same-hash', 'CLIENTE')], cur.fetchall())
            cur.execute("SELECT verification_token FROM domains")
            self.assertEqual('published-token', cur.fetchone()[0])
            cur.execute("SELECT is_active FROM domains")
            self.assertTrue(cur.fetchone()[0])
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

    def test_legacy_preflight_requires_approval_and_never_applies_sql(self):
        from worker.schema_migrations import preflight
        self.legacy()
        with self.assertRaisesRegex(RuntimeError,'adopt'):
            preflight(self.conn)
        preflight(self.conn,adopt_legacy=True)
        with self.conn.cursor() as cur:
            cur.execute("SELECT to_regclass('websec_schema_history'),to_regclass('verification_challenges')")
            self.assertEqual((None,None),cur.fetchone())
            cur.execute('SELECT role FROM users')
            self.assertEqual('USER',cur.fetchone()[0])

    def test_preflight_blocks_modified_history_without_mutating_it(self):
        from worker.schema_migrations import preflight
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("UPDATE websec_schema_history SET checksum='changed' WHERE version=1")
        self.conn.commit()
        with self.assertRaisesRegex(RuntimeError,'checksum'):
            preflight(self.conn)

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
