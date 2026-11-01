"""A real SMTP round trip in CI's disposable Mailpit; never an external inbox."""
import os
import tempfile
import time
import unittest
from email import policy
from email.parser import BytesParser
from pathlib import Path
from unittest.mock import patch
import test_scan_jobs


@unittest.skipUnless(os.getenv('TEST_POSTGRES_DSN') and os.getenv('TEST_MAILPIT_URL'),'Mailpit/PG integration not configured')
class MailpitDeliveryTests(unittest.TestCase):
    setUp=test_scan_jobs.ScanJobTests.setUp
    tearDown=test_scan_jobs.ScanJobTests.tearDown

    def test_completed_scan_pdf_is_delivered_to_owner_with_exact_attachment(self):
        import requests
        from worker.scan_jobs import claim_next,complete
        from worker.report_jobs import process_next_report
        from worker.email_jobs import process_next_email
        url=os.environ['TEST_MAILPIT_URL'].rstrip('/')
        for attempt in range(30):
            try:
                requests.get(url+'/api/v1/info',timeout=2).raise_for_status();break
            except requests.RequestException:
                if attempt==29:raise
                time.sleep(.2)
        with tempfile.TemporaryDirectory() as folder,patch('worker.report_service.REPORTS_DIR',folder),patch.dict(os.environ,{
            'REPORT_EMAIL_ENABLED':'true','REPORTS_DIR':folder,'SMTP_HOST':'localhost','SMTP_PORT':'1025',
            'SMTP_TLS_MODE':'none','SMTP_USER':'','SMTP_PASSWORD':'','REPORT_FROM_EMAIL':'reports@example.invalid'}):
            complete(self.conn,claim_next(self.conn),[])
            self.assertTrue(process_next_report(self.conn))
            with self.conn.cursor() as cur:
                cur.execute('SELECT pdf_url FROM reports WHERE scan_id=1');key=cur.fetchone()[0]
            self.conn.commit()
            expected=(Path(folder)/key).read_bytes()
            self.assertTrue(process_next_email(self.conn))
            raw=requests.get(url+'/api/v1/message/latest/raw',timeout=5)
            raw.raise_for_status()
            message=BytesParser(policy=policy.default).parsebytes(raw.content)
            self.assertEqual('job@example.invalid',str(message['To']))
            attachment=list(message.iter_attachments())[0]
            self.assertEqual('application/pdf',attachment.get_content_type())
            self.assertEqual(expected,attachment.get_payload(decode=True))
            with self.conn.cursor() as cur:
                cur.execute("SELECT s.status,r.status,r.email_status,r.sent_at IS NOT NULL FROM reports r JOIN scans s ON s.id=r.scan_id")
                self.assertEqual(('COMPLETED','READY','SENT',True),cur.fetchone())
            self.assertFalse(process_next_email(self.conn))
