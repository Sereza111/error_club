"""Exercise publication/rollback against a disposable local Git origin."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("publisher", Path(__file__).resolve().parents[1] / "ops/publish.py")
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin"
        self.origin.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Publisher test")
        self.git("config", "user.email", "test@example.invalid")
        publisher.STATE = self.root / "state"
        publisher.WEB = self.root / "web"
        publisher.WEB.mkdir()
        publisher.REPO = publisher.STATE / "repository.git"
        publisher.REMOTE = str(self.origin)
        (publisher.WEB / "index.html").write_text("previous")
        (self.origin / "index.html").write_text("new page")
        (self.origin / "app.js").write_text("new script")
        (self.origin / "site-manifest.json").write_text(json.dumps(["index.html", "app.js"]))
        self.commit()

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.origin), *args], stderr=subprocess.DEVNULL)

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-m", "test revision")

    def test_publish_backup_idempotency(self):
        publisher.main()
        self.assertEqual((publisher.WEB / "index.html").read_text(), "new page")
        self.assertEqual((publisher.STATE / "deployed-revision").read_text().strip(), self.git("rev-parse", "HEAD").decode().strip())
        backups = list((publisher.STATE / "backups").glob("*/index.html"))
        self.assertEqual(backups[0].read_text(), "previous")
        publisher.main()
        self.assertEqual(len(list((publisher.STATE / "backups").iterdir())), 1)

    def test_reject_escaping_manifest_before_write(self):
        (self.origin / "site-manifest.json").write_text(json.dumps(["index.html", "../escape.html"]))
        self.commit()
        with self.assertRaises(ValueError):
            publisher.main()
        self.assertEqual((publisher.WEB / "index.html").read_text(), "previous")
        self.assertFalse((publisher.STATE / "deployed-revision").exists())

    def test_rollback_after_write_failure(self):
        original = publisher.replace
        def fail_marker(target, data):
            if target.name == "deployed-revision":
                raise OSError("simulated disk error")
            return original(target, data)
        publisher.replace = fail_marker
        try:
            with self.assertRaises(OSError):
                publisher.main()
        finally:
            publisher.replace = original
        self.assertEqual((publisher.WEB / "index.html").read_text(), "previous")
        self.assertFalse((publisher.WEB / "app.js").exists())


if __name__ == "__main__":
    unittest.main()
