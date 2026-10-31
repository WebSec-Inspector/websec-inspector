import unittest
from unittest.mock import Mock
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Clock:
    def __init__(self): self.now = 0
    def time(self): return self.now
    def sleep(self, seconds): self.now += seconds


class FakeApi:
    def __init__(self, stalled=False):
        self.calls = []
        self.stalled = stalled

    def call(self, component, kind, operation, params=None, timeout=10):
        self.calls.append((component, operation, params, timeout))
        if operation == 'scan': return {'scan': '17' if component == 'spider' else '23'}
        if operation == 'status': return {'status': '0' if self.stalled else '100'}
        if operation == 'recordsToScan': return {'recordsToScan': '0'}
        if operation == 'alerts': return {'alerts': []}
        return {'Result': 'OK'}


class DeadlineTests(unittest.TestCase):
    def test_non_finite_budgets_are_rejected_before_network_or_heartbeat(self):
        from worker.zap_runner import run_scan
        for value in [float('nan'),float('inf'),float('-inf')]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                run_scan('https://example.invalid',Mock(side_effect=AssertionError('unexpected heartbeat')),
                         api=FakeApi(),timeout_seconds=value)

    def test_http_response_drip_cannot_extend_total_request_deadline(self):
        from worker.zap_runner import ZapApi
        started = threading.Event()
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_GET(self):
                started.set()
                self.send_response(200)
                self.end_headers()
                try:
                    for byte in b'{"Result":"OK"}':
                        self.wfile.write(bytes([byte]))
                        self.wfile.flush()
                        time.sleep(.12)
                except (BrokenPipeError,ConnectionResetError): pass
        server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            begin = time.monotonic()
            with self.assertRaises(TimeoutError):
                ZapApi(f'http://127.0.0.1:{server.server_port}').call('core','view','version',timeout=1)
            self.assertLess(time.monotonic()-begin,1.7)
            self.assertTrue(started.is_set(), 'fixture must actually receive the HTTP request')
        finally:
            server.shutdown()
            server.server_close()

    def test_stalled_spider_stops_its_id_and_deadline_is_bounded(self):
        from worker.zap_runner import run_scan
        clock, api = Clock(), FakeApi(stalled=True)
        with self.assertRaises(TimeoutError):
            run_scan('https://example.invalid', lambda: None, api=api,
                     timeout_seconds=5, clock=clock.time, sleep=clock.sleep)
        self.assertLessEqual(clock.now, 5)
        self.assertTrue(any(c[:3] == ('spider', 'stop', {'scanId': '17'}) for c in api.calls))
        self.assertFalse(any(c[:2] == ('ascan', 'scan') for c in api.calls))

    def test_success_uses_explicit_job_ids_and_returns_alerts(self):
        from worker.zap_runner import run_scan
        clock, api, beat = Clock(), FakeApi(), Mock()
        self.assertEqual([], run_scan('https://example.invalid', beat, api=api,
                                     clock=clock.time, sleep=clock.sleep))
        self.assertTrue(any(c[:3] == ('ascan', 'status', {'scanId': '23'}) for c in api.calls))
        self.assertTrue(all(0 < c[3] <= 10 for c in api.calls))
        self.assertGreater(beat.call_count, 1)

    def test_lost_lease_never_starts_or_stops_another_attempt(self):
        from worker.zap_runner import run_scan
        from worker.scan_jobs import LeaseLost
        api = FakeApi()
        with self.assertRaises(LeaseLost):
            run_scan('https://example.invalid', Mock(side_effect=LeaseLost()), api=api)
        self.assertEqual([], api.calls)


if __name__ == '__main__': unittest.main()
