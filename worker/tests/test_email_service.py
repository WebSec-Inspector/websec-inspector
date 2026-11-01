import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock


class EmailServiceTests(unittest.TestCase):
    def environment(self):
        return patch.dict(os.environ,{'SMTP_HOST':'localhost','SMTP_PORT':'1025','SMTP_TLS_MODE':'none',
            'SMTP_USER':'','SMTP_PASSWORD':'','REPORT_FROM_EMAIL':'reports@example.invalid'})

    def test_attachment_recipient_and_stable_message_id_are_explicit(self):
        from worker.email_service import send_pdf
        with self.environment(), tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'report.pdf';path.write_bytes(b'%PDF-1.4\nexample')
            with patch('worker.email_service.smtplib.SMTP') as smtp:
                for _ in range(2):send_pdf(7,42,1,path,'owner@example.invalid')
                server=smtp.return_value.__enter__.return_value
                messages=[call.args[0] for call in server.send_message.call_args_list]
                self.assertEqual('owner@example.invalid',messages[0]['To'])
                self.assertEqual(messages[0]['Message-ID'],messages[1]['Message-ID'])
                attachment=list(messages[0].iter_attachments())[0]
                self.assertEqual(path.read_bytes(),attachment.get_payload(decode=True))
                self.assertEqual('websec-scan-42.pdf',attachment.get_filename())

    def test_tls_is_independent_of_auth_and_credentials_never_use_plaintext(self):
        from worker.email_service import send_pdf, DeliveryError
        with self.environment(),tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'r.pdf';path.write_bytes(b'%PDF-1.4')
            with patch.dict(os.environ,{'SMTP_TLS_MODE':'starttls'}),patch('worker.email_service.smtplib.SMTP') as smtp:
                send_pdf(1,1,1,path,'owner@example.invalid')
                smtp.return_value.__enter__.return_value.starttls.assert_called_once()
            with patch.dict(os.environ,{'SMTP_USER':'secret-user','SMTP_PASSWORD':'secret-password'}),patch('worker.email_service.smtplib.SMTP') as smtp:
                with self.assertRaises(DeliveryError):send_pdf(1,1,1,path,'owner@example.invalid')
                smtp.assert_not_called()

    def test_file_errors_and_invalid_recipient_are_delivery_failures_without_network(self):
        from worker.email_service import send_pdf, DeliveryError
        with self.environment(),patch('worker.email_service.smtplib.SMTP') as smtp:
            with self.assertRaises(DeliveryError):send_pdf(1,1,1,Path('/missing/report.pdf'),'owner@example.invalid')
            with self.assertRaises(DeliveryError):send_pdf(1,1,1,Path('/missing/report.pdf'),'a@example.invalid\nBcc: other@example.invalid')
            smtp.assert_not_called()
