"""Worker orchestration: fenced completion and independent reporting errors."""
import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import scan_worker as worker
from scan_jobs import Claim

class ScanWorkerTests(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.claim = Claim(42,'attempt-token',1)
        self.target = patch.object(worker,'fetch_scan_target',return_value='qa.example.invalid')
        self.target.start()
        self.addCleanup(self.target.stop)

    def test_zap_failure_records_retry_and_never_generates_pdf(self):
        with patch.object(worker,'run_scan',side_effect=TimeoutError()), \
             patch.object(worker,'fail') as failed, patch.object(worker,'process_next_report') as pdf:
            worker.process_scan(self.conn,self.claim)
        failed.assert_called_once_with(self.conn,self.claim,'SCAN_TIMEOUT',retryable=True)
        pdf.assert_not_called()

    def test_success_parses_alerts_and_completes_atomically(self):
        alerts=[{'alert':'Missing header','risk':'Medium','cweid':'16'}]
        with patch.object(worker,'run_scan',return_value=alerts), \
             patch.object(worker,'complete') as complete, \
             patch.object(worker,'process_next_report') as pdf:
            worker.process_scan(self.conn,self.claim)
        findings=complete.call_args.args[2]
        self.assertEqual('CWE-16',findings[0]['owasp_category'])
        self.assertEqual(5.5,findings[0]['cvss_score'])

    def test_scan_completion_does_not_run_reporting_inline(self):
        with patch.object(worker,'run_scan',return_value=[]), \
             patch.object(worker,'complete') as completed, patch.object(worker,'fail') as failed, \
             patch.object(worker,'process_next_report') as pdf:
            worker.process_scan(self.conn,self.claim)
        completed.assert_called_once_with(self.conn,self.claim,[])
        pdf.assert_not_called()
        failed.assert_not_called()

    def test_lost_lease_discards_result_and_never_emits_report(self):
        with patch.object(worker,'run_scan',side_effect=worker.LeaseLost()), \
             patch.object(worker,'fail') as failed, patch.object(worker,'process_next_report') as pdf:
            worker.process_scan(self.conn,self.claim)
        failed.assert_not_called()
        pdf.assert_not_called()

if __name__ == '__main__': unittest.main()
