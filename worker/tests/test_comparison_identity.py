import os
import unittest
import test_scan_jobs
from worker.zap_parser import parse_zap_alerts


class ComparisonIdentityTests(unittest.TestCase):
    def test_alert_reference_is_preserved_without_inventing_an_id_from_cwe_or_description(self):
        alert={'alert':'Example','risk':'Low','pluginId':'10020','alertRef':'10020-1','method':'get','url':'https://example.invalid'}
        finding=parse_zap_alerts([alert])[0]
        self.assertEqual('10020-1',finding['zap_rule_id'])
        self.assertEqual('get',finding['http_method'])
        for bad in [None,'','CWE-16','-1','x'*300]:
            row=parse_zap_alerts([{**alert,'pluginId':bad,'alertRef':None,'cweid':'16'}])[0]
            self.assertIsNone(row['zap_rule_id'])
        inconsistent=parse_zap_alerts([{**alert,'pluginId':'10021'}])[0]
        self.assertIsNone(inconsistent['zap_rule_id'])


    def test_http_method_tokens_preserve_case_and_support_extension_methods(self):
        alerts=[{'alert':'Rule','risk':'Low','method':m} for m in ['GET','get','M-SEARCH','BASELINE-CONTROL']]
        self.assertEqual(['GET','get','M-SEARCH','BASELINE-CONTROL'],[f['http_method'] for f in parse_zap_alerts(alerts)])



@unittest.skipUnless(os.getenv('TEST_POSTGRES_DSN'),'TEST_POSTGRES_DSN not configured')
class ComparisonPersistenceTests(unittest.TestCase):
    setUp=test_scan_jobs.ScanJobTests.setUp
    tearDown=test_scan_jobs.ScanJobTests.tearDown

    def test_real_worker_completion_preserves_rule_variant_and_method(self):
        from worker.scan_jobs import claim_next,complete
        findings=parse_zap_alerts([{'alert':'Rule','risk':'Low','pluginId':'10020','alertRef':'10020-1','method':'POST','url':'https://example.invalid'}])
        complete(self.conn,claim_next(self.conn),findings)
        with self.conn.cursor() as cur:
            cur.execute('SELECT zap_rule_id,http_method FROM findings')
            self.assertEqual(('10020-1','POST'),cur.fetchone())
