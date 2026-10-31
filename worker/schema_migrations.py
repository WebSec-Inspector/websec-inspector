"""Transactional PostgreSQL migrations shared by deployment and worker startup."""
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path


@dataclass(frozen=True)
class Migration:
    version: int
    checksum: str
    sql: str


def migration_manifest(directory=None):
    directory = Path(directory or Path(__file__).with_name('migrations'))
    result = []
    for path in sorted(directory.glob('[0-9][0-9][0-9]_*.sql')):
        content = path.read_text(encoding='utf-8').encode('utf-8')
        result.append(Migration(int(path.name[:3]), hashlib.sha256(content).hexdigest(), content.decode('utf-8')))
    if not result or [m.version for m in result] != list(range(1, len(result) + 1)):
        raise RuntimeError('Migration manifest must be a contiguous prefix starting at 1')
    return result


def validate_history(manifest, history):
    if len(history) > len(manifest) or any(v not in {m.version for m in manifest} for v, _ in history):
        raise RuntimeError('Database has newer or unknown migrations; incompatible application')
    if [v for v, _ in history] != [m.version for m in manifest[:len(history)]]:
        raise RuntimeError('Migration history contains a gap; expected a prefix')
    for migration, (_, checksum) in zip(manifest, history):
        if migration.checksum != checksum:
            raise RuntimeError(f'Migration checksum mismatch at version {migration.version}')


LEGACY_COLUMNS = {
    'users': {'id', 'email', 'password_hash', 'name', 'role', 'created_at'},
    'domains': {'id', 'user_id', 'hostname', 'verification_token', 'verified_at'},
    'scans': {'id', 'domain_id', 'status', 'created_at', 'started_at', 'finished_at'},
    'findings': {'id', 'scan_id', 'owasp_category', 'description', 'cvss_score', 'severity', 'recommendation'},
    'reports': {'id', 'scan_id', 'pdf_url', 'sent_at'},
}


def validate_schema(cur):
    """Reject incompatible legacy structures before committing their adoption."""
    required = {
        'users': {'id': 'bigint', 'email': 'character varying', 'password_hash': 'character varying',
                  'name': 'character varying', 'role': 'character varying', 'manager_id': 'bigint', 'created_at': 'timestamp with time zone'},
        'domains': {'id': 'bigint', 'user_id': 'bigint', 'hostname': 'character varying',
                    'verification_token': 'character varying', 'verified_at': 'timestamp with time zone',
                    'is_active': 'boolean'},
        'scans': {'id': 'bigint', 'domain_id': 'bigint', 'name': 'character varying', 'status': 'character varying',
                  'created_at': 'timestamp with time zone', 'started_at': 'timestamp with time zone',
                  'finished_at': 'timestamp with time zone', 'deleted_at': 'timestamp with time zone'},
        'findings': {'id': 'bigint', 'scan_id': 'bigint', 'owasp_category': 'character varying',
                     'description': 'text', 'cvss_score': 'double precision', 'severity': 'character varying',
                     'recommendation': 'text', 'title': 'text', 'confidence': 'character varying',
                     'affected_url': 'text', 'affected_parameter': 'text', 'evidence': 'text',
                     'cwe_id': 'character varying', 'wasc_id': 'character varying',
                     'technical_reference': 'text', 'execution_timestamp': 'timestamp with time zone'},
        'reports': {'id': 'bigint', 'scan_id': 'bigint', 'pdf_url': 'character varying', 'sent_at': 'timestamp with time zone'},
    }
    not_null = {
        'users': {'id', 'email', 'password_hash', 'name', 'role', 'created_at'},
        'domains': {'id', 'user_id', 'hostname', 'verification_token', 'is_active'},
        'scans': {'id', 'domain_id', 'status', 'created_at'},
        'findings': {'id', 'scan_id', 'owasp_category', 'description', 'cvss_score', 'severity'},
        'reports': {'id', 'scan_id', 'pdf_url'},
    }
    required['scans'].update({'attempt_count':'integer','worker_token':'uuid',
        'lease_until':'timestamp with time zone','heartbeat_at':'timestamp with time zone',
        'next_attempt_at':'timestamp with time zone','failure_code':'character varying'})
    not_null['scans'].add('attempt_count')
    for table, columns in required.items():
        cur.execute('SELECT column_name,data_type,is_nullable,character_maximum_length,is_identity,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s', (table,))
        actual = {row[0]: row[1:] for row in cur.fetchall()}
        for column, kind in columns.items():
            if column not in actual or actual[column][0] != kind:
                raise RuntimeError(f'Incompatible schema type: {table}.{column}')
            if column in not_null[table] and actual[column][1] != 'NO':
                raise RuntimeError(f'Incompatible schema nullable column: {table}.{column}')
            expected_length = 120 if table == 'scans' and column == 'name' else 64 if table == 'scans' and column == 'failure_code' else 255
            if kind == 'character varying' and actual[column][2] != expected_length:
                raise RuntimeError(f'Incompatible schema length: {table}.{column}')
            if table == 'domains' and column == 'is_active' and actual[column][4] != 'true':
                raise RuntimeError('Incompatible schema default: domains.is_active must default to true')
        if actual['id'][3] != 'YES' and not (actual['id'][4] or '').startswith('nextval('):
            raise RuntimeError(f'Incompatible schema identity: {table}.id')
    cur.execute('''SELECT t.relname,c.contype,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
              JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord),
        f.relname,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
              JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord)
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class f ON f.oid=c.confrelid
        WHERE n.nspname=current_schema()''')
    constraints = {(t, kind, tuple(cols), target, tuple(refcols)) for t, kind, cols, target, refcols in cur.fetchall()}
    needed = {(table, 'p', ('id',), None, ()) for table in required}
    needed |= {(table, 'u', cols, None, ()) for table, cols in [
        ('users', ('email',)), ('domains', ('verification_token',)),
        ('domains', ('hostname', 'user_id')), ('reports', ('scan_id',))]}
    needed |= {(table, 'f', (column,), target, ('id',)) for table, column, target in [
        ('users', 'manager_id', 'users'), ('domains', 'user_id', 'users'),
        ('scans', 'domain_id', 'domains'), ('findings', 'scan_id', 'scans'), ('reports', 'scan_id', 'scans')]}
    if not needed.issubset(constraints):
        raise RuntimeError('Incompatible schema constraint: missing primary/unique/foreign key')


def migrate(conn, *, adopt_legacy=False, check_only=False, directory=None):
    manifest = migration_manifest(directory)
    applied = []
    # One transaction includes bootstrap, upgrades and history. No SQL file may
    # contain transaction-control statements; an error must roll back all files.
    with conn:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '10s'")
            cur.execute("SET LOCAL statement_timeout = '60s'")
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))")
            cur.execute("SELECT tablename FROM pg_tables WHERE schemaname=current_schema()")
            tables = {row[0] for row in cur.fetchall()}
            if 'websec_schema_history' not in tables:
                if check_only:
                    raise RuntimeError('Schema migration required before application startup')
                if tables:
                    if not adopt_legacy:
                        raise RuntimeError('Existing schema requires explicit adopt_legacy approval after backup')
                    if tables != set(LEGACY_COLUMNS):
                        raise RuntimeError('Unknown or partial legacy schema tables; inventory required')
                    for table, required in LEGACY_COLUMNS.items():
                        cur.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s', (table,))
                        if not required.issubset({row[0] for row in cur.fetchall()}):
                            raise RuntimeError(f'Unknown legacy schema columns in {table}')
                cur.execute('CREATE TABLE websec_schema_history (version integer PRIMARY KEY, checksum varchar(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
            cur.execute('SELECT version,checksum FROM websec_schema_history ORDER BY version')
            history = cur.fetchall()
            validate_history(manifest, history)
            if check_only and len(history) != len(manifest):
                raise RuntimeError('Schema migration required before application startup')
            for migration in manifest[len(history):]:
                cur.execute(migration.sql)
                cur.execute('INSERT INTO websec_schema_history(version,checksum) VALUES (%s,%s)', (migration.version, migration.checksum))
                applied.append(migration.version)
            validate_schema(cur)
    return applied


def main():
    import argparse
    import psycopg2
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    conn = psycopg2.connect(host=os.getenv('DB_HOST', 'localhost'), port=os.getenv('DB_PORT', '5432'),
                            dbname=os.getenv('DB_NAME', 'websec'), user=os.getenv('DB_USER', 'websec'),
                            password=os.getenv('DB_PASSWORD', 'websec'), connect_timeout=10)
    try:
        applied = migrate(conn, adopt_legacy=os.getenv('SCHEMA_ADOPT_LEGACY') == 'true', check_only=args.check)
        print('Schema compatible; applied versions:', applied)
    except Exception as exc:
        # PostgreSQL error detail can contain account data: never print it here.
        print('Schema migration/check failed:', type(exc).__name__)
        raise SystemExit(1) from None
    finally:
        conn.close()


if __name__ == '__main__':
    main()
