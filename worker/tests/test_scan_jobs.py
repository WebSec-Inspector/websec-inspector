"""Recovery and fencing use real PostgreSQL in CI, never a production schema."""
import os
import unittest
import uuid


@unittest.skipUnless(os.getenv('TEST_POSTGRES_DSN'), 'TEST_POSTGRES_DSN not configured')
class ScanJobTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2 import sql
        from worker.schema_migrations import migrate
        self.conn = psycopg2.connect(os.environ['TEST_POSTGRES_DSN'])
        self.schema = 'jobs_' + uuid.uuid4().hex
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(self.schema)))
            cur.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(self.schema)))
        self.conn.commit()
        migrate(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('job@example.invalid','hash','Job','CLIENTE',now())")
            cur.execute("INSERT INTO domains(user_id,hostname,verification_token) VALUES (1,'example.invalid','token')")
            cur.execute("INSERT INTO scans(domain_id,status,created_at) VALUES (1,'QUEUED',now())")
        self.conn.commit()

    def tearDown(self):
        from psycopg2 import sql
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(self.schema)))
        self.conn.commit()
        self.conn.close()

    def test_queued_scan_is_claimed_without_any_redis_notification(self):
        from worker.scan_jobs import claim_next, complete
        claim = claim_next(self.conn)
        self.assertEqual(1, claim.scan_id)
        complete(self.conn, claim, [])
        self.assertIsNone(claim_next(self.conn))

    def test_expired_attempt_is_fenced_and_results_are_committed_once(self):
        from worker.scan_jobs import claim_next, complete, heartbeat, LeaseLost
        from worker.zap_parser import parse_zap_alerts
        old = claim_next(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("UPDATE scans SET lease_until=now()-interval '1 second'")
        self.conn.commit()
        new = claim_next(self.conn)
        self.assertNotEqual(old.token, new.token)
        with self.assertRaises(LeaseLost): heartbeat(self.conn, old)
        with self.assertRaises(LeaseLost): complete(self.conn, old, [])
        complete(self.conn, new, parse_zap_alerts([{'alert': 'Once', 'risk': 'Low'}]))
        with self.assertRaises(LeaseLost): complete(self.conn, new, [])
        with self.conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM findings')
            self.assertEqual(1, cur.fetchone()[0])

    def test_last_expired_attempt_becomes_failed_instead_of_restarting_forever(self):
        from worker.scan_jobs import claim_next
        for attempt in range(3):
            self.assertIsNotNone(claim_next(self.conn))
            with self.conn.cursor() as cur:
                cur.execute("UPDATE scans SET lease_until=now()-interval '1 second'")
            self.conn.commit()
        self.assertIsNone(claim_next(self.conn))
        with self.conn.cursor() as cur:
            cur.execute('SELECT status,attempt_count,finished_at IS NOT NULL FROM scans')
            self.assertEqual(('FAILED',3,True), cur.fetchone())

    def test_deleted_and_pending_scans_cannot_be_claimed(self):
        from worker.scan_jobs import claim_next
        with self.conn.cursor() as cur:
            cur.execute("UPDATE scans SET status='PENDING_VERIFICATION'")
        self.conn.commit()
        self.assertIsNone(claim_next(self.conn))
        with self.conn.cursor() as cur:
            cur.execute("UPDATE scans SET status='QUEUED',deleted_at=now()")
        self.conn.commit()
        self.assertIsNone(claim_next(self.conn))

    def test_invalid_findings_roll_back_completion_and_preserve_data(self):
        from worker.scan_jobs import claim_next, complete
        claim = claim_next(self.conn)
        with self.assertRaises(KeyError): complete(self.conn, claim, [{}])
        with self.conn.cursor() as cur:
            cur.execute('SELECT status FROM scans')
            self.assertEqual('RUNNING',cur.fetchone()[0])
        self.conn.commit()
        complete(self.conn, claim, [])

    def test_connection_drop_releases_scanner_and_expired_work_is_recovered(self):
        import psycopg2
        from psycopg2 import sql
        from worker.scan_jobs import acquire_scanner, claim_next
        self.assertTrue(acquire_scanner(self.conn))
        claim = claim_next(self.conn)
        other = psycopg2.connect(os.environ['TEST_POSTGRES_DSN'])
        with other.cursor() as cur:
            cur.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(self.schema)))
        other.commit()
        try:
            self.assertFalse(acquire_scanner(other))
            self.conn.close()
            self.conn = other
            self.assertTrue(acquire_scanner(other))
            with other.cursor() as cur:
                cur.execute("UPDATE scans SET lease_until=now()-interval '1 second'")
            other.commit()
            recovered = claim_next(other)
            self.assertEqual(claim.scan_id,recovered.scan_id)
            self.assertNotEqual(claim.token,recovered.token)
            self.assertEqual(2,recovered.attempt)
        finally:
            if self.conn is not other: other.close()


if __name__ == '__main__': unittest.main()
