"""Regression for registration against the pre-authorization PostgreSQL schema."""
import os
from pathlib import Path
import unittest
import uuid


@unittest.skipUnless(os.getenv("TEST_POSTGRES_DSN"), "TEST_POSTGRES_DSN not configured")
class UserRoleMigrationTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2 import sql

        self.conn = psycopg2.connect(os.environ["TEST_POSTGRES_DSN"])
        self.schema = "roles_" + uuid.uuid4().hex
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
            cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
            cur.execute("""
                CREATE TABLE users (
                    id bigint PRIMARY KEY, email text NOT NULL UNIQUE,
                    password_hash text NOT NULL, role varchar(255) NOT NULL,
                    CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'))
                );
                INSERT INTO users VALUES
                    (1, 'client@example.invalid', 'client-hash', 'USER'),
                    (2, 'admin@example.invalid', 'admin-hash', 'ADMIN');
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
        path = Path(__file__).resolve().parents[2] / "infra/migrations/20261010-normalizar-perfis.sql"
        with self.conn.cursor() as cur:
            cur.execute(path.read_text(encoding="utf-8"))
        self.conn.commit()

    def test_old_schema_accepts_registration_after_repeatable_migration(self):
        self.migrate()
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("SELECT id, email, password_hash, role FROM users ORDER BY id")
            self.assertEqual([
                (1, 'client@example.invalid', 'client-hash', 'CLIENTE'),
                (2, 'admin@example.invalid', 'admin-hash', 'ADMINISTRADOR'),
            ], cur.fetchall())
            for identifier, role in enumerate(['CLIENTE', 'GERENTE', 'ADMINISTRADOR'], 3):
                cur.execute("INSERT INTO users VALUES (%s, %s, 'new-hash', %s)",
                            (identifier, f'new-{identifier}@example.invalid', role))
        self.conn.commit()
        import psycopg2
        for invalid in ['USER', 'ADMIN', 'UNKNOWN']:
            with self.assertRaises(psycopg2.errors.CheckViolation):
                with self.conn:
                    with self.conn.cursor() as cur:
                        cur.execute("INSERT INTO users VALUES (99, 'invalid@example.invalid', 'hash', %s)", (invalid,))

    def test_legacy_check_with_another_name_is_replaced(self):
        with self.conn.cursor() as cur:
            cur.execute('ALTER TABLE users RENAME CONSTRAINT users_role_check TO legacy_role_check')
        self.conn.commit()
        self.migrate()
        with self.conn.cursor() as cur:
            cur.execute("SELECT role FROM users ORDER BY id")
            self.assertEqual([('CLIENTE',), ('ADMINISTRADOR',)], cur.fetchall())

    def test_unknown_existing_role_aborts_without_changing_data_or_checks(self):
        import psycopg2
        with self.conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE users DROP CONSTRAINT users_role_check;
                ALTER TABLE users ADD CONSTRAINT custom_role_check CHECK (length(role) > 0);
                INSERT INTO users VALUES (3, 'unknown@example.invalid', 'hash', 'UNKNOWN');
            """)
        self.conn.commit()
        with self.assertRaises(psycopg2.Error):
            self.migrate()
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute("SELECT role FROM users ORDER BY id")
            self.assertEqual([('USER',), ('ADMIN',), ('UNKNOWN',)], cur.fetchall())
            cur.execute("SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c'")
            self.assertEqual([('custom_role_check',)], cur.fetchall())
