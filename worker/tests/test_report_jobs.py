"""Reports are durable jobs independent of ZAP and scan outcome."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_scan_jobs import ScanJobTests


@unittest.skipUnless(os.getenv('TEST_POSTGRES_DSN'), 'TEST_POSTGRES_DSN not configured')
class ReportJobsTests(unittest.TestCase):
    setUp = ScanJobTests.setUp
    tearDown = ScanJobTests.tearDown

    def completed(self):
        from worker.scan_jobs import claim_next, complete
        complete(self.conn, claim_next(self.conn), [])

    def test_completion_atomically_schedules_report_and_restart_can_claim_it(self):
        self.completed()
        with self.conn.cursor() as cur:
            cur.execute('SELECT status FROM reports WHERE scan_id=1')
            self.assertEqual(('PENDING',), cur.fetchone())
        self.conn.commit()
        from worker.report_jobs import process_next_report
        with tempfile.TemporaryDirectory() as folder, patch('worker.report_service.REPORTS_DIR', folder):
            self.assertTrue(process_next_report(self.conn))
            self.assertFalse(process_next_report(self.conn))
            with self.conn.cursor() as cur:
                cur.execute('SELECT status,pdf_url FROM reports WHERE scan_id=1')
                status, key = cur.fetchone()
                self.assertEqual('READY', status)
                self.assertTrue((Path(folder) / key).read_bytes().startswith(b'%PDF-'))

    def test_pdf_failure_preserves_completed_scan_and_supports_explicit_retry(self):
        self.completed()
        from worker.report_jobs import process_next_report
        with patch('worker.report_jobs.generate_pdf_report', side_effect=OSError('private path')):
            self.assertTrue(process_next_report(self.conn))
        with self.conn.cursor() as cur:
            cur.execute('SELECT s.status,r.status,r.failure_code FROM scans s JOIN reports r ON r.scan_id=s.id')
            self.assertEqual(('COMPLETED','FAILED','PDF_GENERATION_FAILED'), cur.fetchone())
            cur.execute("UPDATE reports SET status='PENDING' WHERE scan_id=1")
        self.conn.commit()
        with tempfile.TemporaryDirectory() as folder, patch('worker.report_service.REPORTS_DIR', folder):
            self.assertTrue(process_next_report(self.conn))
        with self.conn.cursor() as cur:
            cur.execute('SELECT status FROM reports')
            self.assertEqual(('READY',),cur.fetchone())

    def test_expired_report_attempt_is_fenced_and_does_not_replace_newer_result(self):
        self.completed()
        from worker.report_jobs import claim_report, finish_report
        old = claim_report(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("UPDATE reports SET lease_until=now()-interval '1 second'")
        self.conn.commit()
        new = claim_report(self.conn)
        self.assertNotEqual(old.token,new.token)
        self.assertFalse(finish_report(self.conn,old,'old.pdf'))
        self.assertTrue(finish_report(self.conn,new,'new.pdf'))
        self.assertIsNone(claim_report(self.conn))
