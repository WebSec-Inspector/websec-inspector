import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import test_scan_jobs


@unittest.skipUnless(os.getenv('TEST_POSTGRES_DSN'),'TEST_POSTGRES_DSN not configured')
class EmailJobsTests(unittest.TestCase):
    setUp=test_scan_jobs.ScanJobTests.setUp
    tearDown=test_scan_jobs.ScanJobTests.tearDown

    def ready(self):
        from worker.scan_jobs import claim_next,complete
        from worker.report_jobs import process_next_report
        complete(self.conn,claim_next(self.conn),[])
        with patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true'}):process_next_report(self.conn)

    def test_two_accounts_receive_only_their_own_report_and_sent_is_not_repeated(self):
        from worker.email_jobs import process_next_email
        from worker.email_service import DeliveryError
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder}),patch('worker.report_service.REPORTS_DIR',folder):
            self.ready()
            with self.conn.cursor() as cur:
                cur.execute("INSERT INTO users(email,password_hash,name,role,created_at) VALUES ('second@example.invalid','hash','Second','CLIENTE',now())")
                cur.execute("INSERT INTO domains(user_id,hostname,verification_token) VALUES (2,'second.invalid','second-token')")
                cur.execute("INSERT INTO scans(domain_id,status,created_at) VALUES (2,'COMPLETED',now())")
                cur.execute("INSERT INTO reports(scan_id,pdf_url,status,email_status) VALUES (2,'second.pdf','READY','PENDING')")
            self.conn.commit();(Path(folder)/'second.pdf').write_bytes(b'%PDF-1.4\nsecond')
            with patch('worker.email_jobs.send_pdf') as send:
                self.assertTrue(process_next_email(self.conn));self.assertTrue(process_next_email(self.conn))
                self.assertFalse(process_next_email(self.conn))
                self.assertEqual(['job@example.invalid','second@example.invalid'],[call.args[4] for call in send.call_args_list])
                self.assertNotEqual(send.call_args_list[0].args[3],send.call_args_list[1].args[3])
            with self.conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM reports WHERE email_status='SENT' AND sent_at IS NOT NULL")
                self.assertEqual(2,cur.fetchone()[0])

    def test_smtp_failure_retries_with_backoff_and_never_changes_scan_or_pdf(self):
        from worker.email_jobs import process_next_email
        from worker.email_service import DeliveryError
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder}),patch('worker.report_service.REPORTS_DIR',folder):
            self.ready()
            with patch('worker.email_jobs.send_pdf',side_effect=DeliveryError('SMTP_UNAVAILABLE',retryable=True)):
                for attempt in range(3):
                    self.assertTrue(process_next_email(self.conn))
                    if attempt<2:
                        self.assertFalse(process_next_email(self.conn))
                        with self.conn.cursor() as cur:cur.execute("UPDATE reports SET email_next_attempt_at=now()-interval '1 second'")
                        self.conn.commit()
            with self.conn.cursor() as cur:
                cur.execute('SELECT s.status,r.status,r.email_status,r.email_attempt_count,r.sent_at FROM scans s JOIN reports r ON r.scan_id=s.id')
                self.assertEqual(('COMPLETED','READY','FAILED',3,None),cur.fetchone())

    def test_stale_attempt_is_fenced_and_disabled_delivery_does_not_claim(self):
        from worker.email_jobs import claim_email,finish_email,process_next_email
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder}),patch('worker.report_service.REPORTS_DIR',folder):
            self.ready();old=claim_email(self.conn)
            with self.conn.cursor() as cur:cur.execute("UPDATE reports SET email_lease_until=now()-interval '1 second'")
            self.conn.commit();new=claim_email(self.conn)
            self.assertNotEqual(old.token,new.token)
            self.assertFalse(finish_email(self.conn,old))
            self.assertTrue(finish_email(self.conn,new))
            with patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'false'}),patch('worker.email_jobs.send_pdf') as send:
                self.assertFalse(process_next_email(self.conn));send.assert_not_called()

    def test_replaced_pdf_cannot_be_marked_sent_by_an_old_email_attempt(self):
        from worker.email_jobs import claim_email,finish_email
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder}),patch('worker.report_service.REPORTS_DIR',folder):
            self.ready();old=claim_email(self.conn)
            with self.conn.cursor() as cur:cur.execute("UPDATE reports SET pdf_url='replacement.pdf' WHERE id=%s",(old.report_id,))
            self.conn.commit()
            self.assertFalse(finish_email(self.conn,old))

    def test_delete_waits_for_inflight_send_instead_of_committing_before_smtp(self):
        from worker.email_jobs import process_next_email
        from concurrent.futures import ThreadPoolExecutor
        import threading
        import psycopg2
        from psycopg2 import sql
        observed={};started=threading.Event()
        def delete():
            conn=psycopg2.connect(os.environ['TEST_POSTGRES_DSN'])
            try:
                with conn:
                    with conn.cursor() as cur:
                        cur.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(self.schema)))
                        cur.execute("SET LOCAL lock_timeout='5s'")
                        started.set()
                        cur.execute('UPDATE scans SET deleted_at=now() WHERE id=1')
            finally:conn.close()
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder}),patch('worker.report_service.REPORTS_DIR',folder),ThreadPoolExecutor(max_workers=1) as pool:
            self.ready()
            def send(*args):
                observed['future']=pool.submit(delete)
                started.wait(2)
                try:observed['future'].result(timeout=.2);observed['blocked']=False
                except TimeoutError:observed['blocked']=True
            with patch('worker.email_jobs.send_pdf',side_effect=send):self.assertTrue(process_next_email(self.conn))
            observed['future'].result(timeout=5)
            self.assertTrue(observed['blocked'],'Deletion committed before the in-flight SMTP side effect')
