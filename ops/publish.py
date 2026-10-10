#!/usr/bin/env python3
"""Read public Git and copy only manifest-listed static files. Never run repo code.

Install a reviewed copy outside the checkout. Run as a dedicated user with write
access only to this site's root and publisher state. Back up changed files.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile
import time

STATE = Path("/var/lib/errorclub-publisher")
WEB = Path("/var/www/errorclub.club")
REPO = STATE / "repository.git"
REMOTE = "https://github.com/Sereza111/error_club.git"


def git(*args):
    return subprocess.check_output(["git", "--git-dir", str(REPO), *args],
                                   timeout=120, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})


def safe_target(name):
    path = PurePosixPath(name)
    if (not re.fullmatch(r"[A-Za-z0-9_./-]+", name) or path.is_absolute()
            or any(part in {"", ".", ".."} for part in name.split("/"))):
        raise ValueError(f"Unsafe path: {name}")
    if path.suffix not in {".html", ".css", ".js", ".json", ".svg", ".webp", ".png", ".jpg", ".mp3", ".mp4", ".woff2"}:
        raise ValueError(f"Not a static asset: {name}")
    if len(path.parts) > 1 and path.parts[0] not in {"artists", "assets"}:
        raise ValueError(f"Unexpected directory: {name}")
    target = WEB / name
    for item in [target, *target.parents]:
        if item.is_symlink():
            raise ValueError(f"Symlink in destination: {name}")
        if item == WEB:
            break
    if not target.resolve().is_relative_to(WEB.resolve()):
        raise ValueError(f"Escaping destination: {name}")
    return target


def replace(target, data):
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, temporary = tempfile.mkstemp(prefix=".publish-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    os.umask(0o022)
    STATE.mkdir(parents=True, exist_ok=True)
    if not REPO.exists():
        subprocess.run(["git", "init", "--bare", str(REPO)], check=True, timeout=30)
        git("remote", "add", "origin", REMOTE)
    if git("remote", "get-url", "origin").decode().strip() != REMOTE:
        raise ValueError("Unexpected Git remote")
    git("fetch", "--depth=1", "origin", "main")
    revision = git("rev-parse", "FETCH_HEAD").decode().strip()
    previous = STATE / "deployed-revision"
    if previous.exists() and previous.read_text().strip() == revision:
        print(f"Already deployed {revision}")
        return
    manifest = json.loads(git("show", f"{revision}:site-manifest.json"))
    if not isinstance(manifest, list) or not 1 <= len(manifest) <= 500 or "index.html" not in manifest:
        raise ValueError("Invalid publishing manifest")
    if len(set(manifest)) != len(manifest):
        raise ValueError("Duplicate publishing paths")
    tree = {}
    for record in git("ls-tree", "-rz", revision).split(b"\0"):
        if record:
            meta, name = record.split(b"\t", 1)
            tree[name.decode()] = meta.split()[0]
    files = {}
    for name in manifest:
        safe_target(name)
        if tree.get(name) != b"100644":
            raise ValueError(f"Missing/non-regular static file: {name}")
        data = git("show", f"{revision}:{name}")
        if not data or len(data) > 50_000_000:
            raise ValueError(f"Empty/oversized file: {name}")
        files[name] = data
    if sum(map(len, files.values())) > 150_000_000:
        raise ValueError("Release too large")

    # Media/scripts first, HTML last. Back up and write only changed files.
    changed = []
    for name in sorted(files, key=lambda item: (item.endswith(".html"), item)):
        target = safe_target(name)
        if not target.exists() or hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(files[name]).digest():
            changed.append(name)
    backup = STATE / "backups" / (time.strftime("%Y%m%d-%H%M%S-") + revision[:12])
    backup.mkdir(parents=True)
    existed = set()
    for name in changed:
        target = safe_target(name)
        if target.exists():
            saved = backup / name
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
            existed.add(name)
    (backup / "changes.json").write_text(json.dumps({"revision": revision, "changed": changed,
                                                   "previously_existed": sorted(existed)}))
    written = []
    try:
        for name in changed:
            replace(safe_target(name), files[name])
            written.append(name)
        replace(previous, (revision + "\n").encode())
    except Exception:
        for name in reversed(written):
            target = safe_target(name)
            if name in existed:
                replace(target, (backup / name).read_bytes())
            else:
                target.unlink()
        raise
    print(f"Deployed {revision}; changed {len(changed)} files; backup {backup}")


if __name__ == "__main__":
    main()
