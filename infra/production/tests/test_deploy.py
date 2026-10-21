"""Exercise deployment state transitions without network or a Docker daemon."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "deploy.sh"
OLD_SHA = "a" * 40
NEW_SHA = "b" * 40


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.release = self.root / "releases" / NEW_SHA
        self.release.mkdir(parents=True)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.events = self.root / "events"
        (self.root / ".env").write_text("SITE_HOST=example.test\n")
        (self.release / "compose.yml").write_text("services: {}\n")
        (self.release / "Caddyfile").write_text("example.test {}\n")
        (self.release / "backup.sh").write_text("#!/bin/bash\nexit 0\n")
        for command in ("docker", "curl"):
            fake = self.bin / command
            fake.write_text("#!/usr/bin/env python3\n" + '''
import json, os, pathlib, sys
args = sys.argv[1:]
tag = ''
for index, arg in enumerate(args):
    if arg == '--env-file':
        file = pathlib.Path(args[index+1])
        if file.exists():
            for line in file.read_text().splitlines():
                if line.startswith('IMAGE_TAG='): tag = line.split('=', 1)[1]
with open(os.environ['EVENTS'], 'a') as output:
    output.write(json.dumps({'command': pathlib.Path(sys.argv[0]).name, 'args': args, 'tag': tag}) + '\\n')
if 'pull' in args and os.environ.get('FAIL_PULL') == '1': sys.exit(12)
if 'up' in args and tag.endswith('b' * 40) and os.environ.get('FAIL_UP') == '1': sys.exit(13)
if pathlib.Path(sys.argv[0]).name == 'curl' and os.environ.get('FAIL_HTTPS') == '1': sys.exit(22)
if pathlib.Path(sys.argv[0]).name == 'curl' and args[-1].endswith('/version.txt'):
    print(os.environ.get('VERSION_SHA', 'b' * 40))
''')
            fake.chmod(0o755)
        self.env = dict(os.environ, WEBSEC_ROOT=str(self.root),
                        EVENTS=str(self.events), PATH=f"{self.bin}:{os.environ['PATH']}")

    def previous(self):
        old = self.root / "releases" / OLD_SHA
        old.mkdir(parents=True)
        (old / "compose.yml").write_text("services: {}\n")
        (self.root / ".release.env").write_text(f"IMAGE_TAG=sha-{OLD_SHA}\nRELEASE_DIR={old}\n")

    def run_deploy(self, sha=NEW_SHA, **overrides):
        self.assertTrue(SCRIPT.exists(), "deploy.sh must implement the deployment contract")
        shutil.copyfile(SCRIPT, self.release / "deploy.sh")
        return subprocess.run(["bash", str(self.release / "deploy.sh"), sha],
                              env=dict(self.env, **overrides), capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.events.read_text().splitlines()] if self.events.exists() else []

    def test_invalid_sha_leaves_release_untouched(self):
        self.previous()
        before = (self.root / ".release.env").read_text()
        result = self.run_deploy("../../bad")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / ".release.env").read_text(), before)
        self.assertEqual(self.calls(), [])

    def test_failed_pull_keeps_previous_version(self):
        self.previous()
        before = (self.root / ".release.env").read_text()
        result = self.run_deploy(FAIL_PULL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / ".release.env").read_text(), before)
        self.assertFalse(any("up" in event["args"] for event in self.calls()))

    def test_failed_start_restores_previous_images_and_configuration(self):
        self.previous()
        before = (self.root / ".release.env").read_text()
        result = self.run_deploy(FAIL_UP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / ".release.env").read_text(), before)
        starts = [event["tag"] for event in self.calls() if "up" in event["args"]]
        self.assertEqual(starts, [f"sha-{NEW_SHA}", f"sha-{OLD_SHA}"])

    def test_failed_https_verification_restores_previous_version(self):
        self.previous()
        result = self.run_deploy(FAIL_HTTPS="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"sha-{OLD_SHA}", (self.root / ".release.env").read_text())

    def test_success_keeps_new_version_and_never_deletes_volumes(self):
        self.previous()
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"sha-{NEW_SHA}", (self.root / ".release.env").read_text())
        for event in self.calls():
            self.assertFalse(set(event["args"]) & {"down", "--volumes", "volume", "prune"})

    def test_first_failed_deploy_does_not_record_successful_release(self):
        result = self.run_deploy(FAIL_UP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".release.env").exists())

    def test_wrong_public_version_rolls_back(self):
        self.previous()
        result = self.run_deploy(VERSION_SHA="c" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"sha-{OLD_SHA}", (self.root / ".release.env").read_text())

    def test_concurrent_deploy_is_rejected_before_docker(self):
        with open(self.root / ".deploy.lock", "w") as lock:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
