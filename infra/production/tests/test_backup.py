"""Backup remains usable during an outage; no production daemon is needed."""
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'backup.sh'

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.bin=self.root/'bin';self.bin.mkdir()
        self.events=self.root/'events'
        (self.root/'.release.env').write_text(f'RELEASE_DIR={self.root}\nIMAGE_TAG=sha-test\n')
        (self.root/'.env').write_text('SITE_HOST=example.test\n')
        (self.root/'compose.yml').write_text('services: {}\n')
        fake=self.bin/'docker'
        fake.write_text('''#!/usr/bin/env python3
import io,json,os,sys,tarfile
a=sys.argv[1:]
with open(os.environ['EVENTS'],'a') as f:f.write(json.dumps(a)+'\\n')
if 'pg_dump' in a:
    sys.stdout.buffer.write(b'dump-fixture');sys.exit(0)
if 'pg_restore' in a:
    content=sys.stdin.buffer.read()
    sys.exit(9 if os.environ.get('BAD_DUMP')=='1' or content!=b'dump-fixture' else 0)
if 'ps' in a:
    if os.environ.get('NO_WORKER')!='1':print('c'*64)
    sys.exit(0)
if a and a[0]=='cp':
    if os.environ.get('BAD_REPORTS')=='1':sys.stdout.buffer.write(b'invalid-tar');sys.exit(0)
    with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as archive:
        data=b'report-fixture';entry=tarfile.TarInfo('scan-42.pdf');entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
    sys.exit(0)
if 'worker' in a and 'exec' in a:
    print('service worker is not running',file=sys.stderr);sys.exit(1)
sys.exit(2)
''')
        fake.chmod(0o755)
        self.env=dict(os.environ,WEBSEC_ROOT=str(self.root),EVENTS=str(self.events),PATH=f'{self.bin}:{os.environ["PATH"]}')

    def run_backup(self,**overrides):
        return subprocess.run(['bash',str(SCRIPT)],env=dict(self.env,**overrides),capture_output=True,text=True)
    def calls(self):return [json.loads(line) for line in self.events.read_text().splitlines()]

    def test_stopped_worker_is_copied_without_starting_it(self):
        result=self.run_backup()
        self.assertEqual(0,result.returncode,result.stderr)
        self.assertIn('Backup created:',result.stdout)
        backup=next((self.root/'backups').iterdir())
        self.assertTrue((backup/'COMPLETE').exists())
        self.assertEqual(b'dump-fixture',(backup/'postgres.dump').read_bytes())
        with tarfile.open(backup/'reports.tar.gz') as archive:
            self.assertEqual(b'report-fixture',archive.extractfile('scan-42.pdf').read())
        calls=self.calls()
        self.assertTrue(any('pg_restore' in c for c in calls))
        self.assertTrue(any(c[0]=='cp' for c in calls))
        self.assertFalse(any(set(c)&{'up','start','run','stop','down'} for c in calls))

    def test_invalid_database_archive_stops_before_copying_reports(self):
        result=self.run_backup(BAD_DUMP='1')
        self.assertNotEqual(0,result.returncode)
        self.assertNotIn('Backup created:',result.stdout)
        self.assertTrue(any('pg_restore' in c for c in self.calls()))
        self.assertFalse(any(c[0]=='cp' for c in self.calls()))

    def test_missing_worker_fails_without_a_success_message(self):
        result=self.run_backup(NO_WORKER='1')
        self.assertNotEqual(0,result.returncode)
        self.assertNotIn('Backup created:',result.stdout)

    def test_invalid_reports_archive_does_not_delete_previous_backups(self):
        old=self.root/'backups'/'20200101T000000-fixture';old.mkdir(parents=True)
        (old/'keep').write_text('existing backup')
        result=self.run_backup(BAD_REPORTS='1')
        self.assertNotEqual(0,result.returncode)
        self.assertTrue((old/'keep').exists())
        self.assertNotIn('Backup created:',result.stdout)

    @unittest.skipUnless(os.name == 'posix', 'POSIX file permissions are required')
    def test_explicit_release_metadata_allows_backup_when_default_is_unreadable(self):
        alternate=self.root/'previous-release.env'
        alternate.write_text(f'RELEASE_DIR={self.root}\nIMAGE_TAG=sha-test\n')
        (self.root/'.release.env').chmod(0)
        result=self.run_backup(WEBSEC_RELEASE_ENV=str(alternate))
        self.assertEqual(0,result.returncode,result.stderr)
        self.assertIn('Backup created:',result.stdout)
        self.assertTrue(any(str(alternate) in call for call in self.calls()))

    def test_success_does_not_prune_legacy_or_incomplete_backups(self):
        for i in range(9):
            old=self.root/'backups'/f'20200101T00000{i}-fixture'
            old.mkdir(parents=True);(old/'keep').write_text('not certified')
        result=self.run_backup()
        self.assertEqual(0,result.returncode,result.stderr)
        self.assertEqual(9,len(list((self.root/'backups').glob('*/keep'))))

if __name__=='__main__':unittest.main()
