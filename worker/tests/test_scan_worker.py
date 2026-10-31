"""Regressões de estado do worker, preservando o parser e a persistência atuais."""
import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scan_worker as worker


class ScanWorkerTests(unittest.TestCase):
    def test_zap_failure_persists_failed_and_finished(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = ('qa.example.invalid',)
        with patch.object(worker, 'run_zap_baseline', side_effect=ConnectionError('QA: ZAP indisponível')), \
             patch.object(worker, 'generate_pdf_report') as pdf, \
             self.assertLogs('scan_worker', level='ERROR'):
            worker.process_scan(conn, 42)
        updates = [call.args for call in cursor.execute.call_args_list if 'UPDATE scans' in call.args[0]]
        self.assertEqual(updates[0][1], ('RUNNING', 42))
        self.assertEqual(updates[-1][1], ('FAILED', 42))
        self.assertIn('finished_at = now()', updates[-1][0])
        pdf.assert_not_called()

    def test_success_parses_alerts_persists_and_completes(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = ('qa.example.invalid',)
        alerts = [{'alert': 'Missing header', 'description': 'Missing header',
                   'risk': 'Medium', 'solution': 'Set header', 'cweid': '16'}]
        with patch.object(worker, 'run_zap_baseline', return_value=alerts), \
             patch.object(worker, 'generate_pdf_report', return_value='/qa/scan-42.pdf'), \
             patch.object(worker, 'send_report_email'):
            worker.process_scan(conn, 42)
        inserts = [call.args for call in cursor.execute.call_args_list if 'INSERT INTO findings' in call.args[0]]
        self.assertEqual(inserts[0][1][:7], (42, 'CWE-16', 'Missing header', 5.5, 'MEDIUM', 'Set header', 'Missing header'))
        updates = [call.args for call in cursor.execute.call_args_list if 'UPDATE scans' in call.args[0]]
        self.assertEqual(updates[-1][1], ('COMPLETED', 42))
        self.assertIn('finished_at = now()', updates[-1][0])

    def test_missing_target_raises_instead_of_scanning(self):
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchone.return_value = None
        with self.assertRaisesRegex(ValueError, 'Scan 42 não encontrado'):
            worker.fetch_scan_target(conn, 42)


if __name__ == '__main__':
    unittest.main()
