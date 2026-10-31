"""Bounded ZAP API calls against the dedicated instance owned by this worker."""
import json
import logging
import math
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlencode

log = logging.getLogger('scan_worker')


class ZapApi:
    def __init__(self, base=None):
        self.base = (base or os.getenv('ZAP_API_URL','http://zap:8090')).rstrip('/')

    def call(self, component, kind, operation, params=None, timeout=10):
        url = f'{self.base}/JSON/{component}/{kind}/{operation}/?{urlencode(params or {})}'
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError('HTTP deadline must be positive and finite')
        # Socket timeouts do not bound a response that continuously drips bytes.
        # A disposable subprocess isolates the whole I/O operation, including
        # headers/body; run() kills and reaps it on deadline. No DB FD is inherited.
        try:
            result = subprocess.run([sys.executable,str(Path(__file__).with_name('zap_http.py'))],
                input=json.dumps({'url':url,'timeout':timeout}).encode('utf-8'),
                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=timeout,check=False)
        except subprocess.TimeoutExpired:
            raise TimeoutError('ZAP HTTP total request deadline exceeded') from None
        if result.returncode:
            raise ConnectionError('ZAP API transport failed')
        data = json.loads(result.stdout)
        if not isinstance(data,dict) or 'code' in data:
            raise RuntimeError('ZAP API returned an invalid response')
        return data


def run_scan(target_url, heartbeat, *, api=None, timeout_seconds=None,
             clock=time.monotonic, sleep=time.sleep):
    api = api or ZapApi()
    budget = float(timeout_seconds if timeout_seconds is not None else os.getenv('ZAP_SCAN_TIMEOUT_SECONDS','900'))
    if not math.isfinite(budget) or budget <= 0:
        raise ValueError('ZAP timeout must be positive and finite')
    deadline = clock()+budget
    jobs = []

    def call(component, kind, operation, params=None):
        heartbeat()
        remaining = deadline-clock()
        if remaining <= 0:
            raise TimeoutError('ZAP total scan deadline exceeded')
        return api.call(component,kind,operation,params,timeout=min(10,remaining))

    def wait(component, operation, field, params, done):
        while True:
            result = call(component,'view',operation,params)
            if done(int(result[field])):
                return
            sleep(min(2,max(0,deadline-clock())))

    try:
        # The caller holds the database-wide scanner lock. Clear abandoned ZAP
        # jobs/session before accepting another target on this dedicated instance.
        call('spider','action','stopAllScans')
        call('ascan','action','stopAllScans')
        call('core','action','newSession',{'overwrite':'true'})
        spider = str(call('spider','action','scan',{'url':target_url})['scan'])
        if not spider.isdigit(): raise RuntimeError('Invalid ZAP spider identifier')
        jobs.append(('spider',spider))
        wait('spider','status','status',{'scanId':spider},lambda n:n>=100)
        active = str(call('ascan','action','scan',{'url':target_url})['scan'])
        if not active.isdigit(): raise RuntimeError('Invalid ZAP active scan identifier')
        jobs.append(('ascan',active))
        wait('ascan','status','status',{'scanId':active},lambda n:n>=100)
        wait('pscan','recordsToScan','recordsToScan',None,lambda n:n==0)
        alerts = call('core','view','alerts',{'baseurl':target_url})['alerts']
        if not isinstance(alerts,list): raise ValueError('Invalid ZAP alerts')
        return alerts
    finally:
        # Do not stop IDs from a newer session if this attempt lost ownership.
        for component,identifier in jobs:
            try:
                heartbeat()
            except Exception:
                break
            try:
                api.call(component,'action','stop',{'scanId':identifier},timeout=5)
            except Exception as exc:
                log.warning('ZAP cleanup failed: %s',type(exc).__name__)
