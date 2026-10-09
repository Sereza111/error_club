"""Validate the complete static publishing manifest and local asset references."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "site-manifest.json").read_text(encoding="utf-8"))
assert len(manifest) == len(set(manifest)), "Duplicate manifest entries"
published = set(manifest)


def reference(source, value):
    url = urlsplit(value)
    if url.scheme or url.netloc or not url.path:
        return
    target = (ROOT / unquote(url.path.lstrip("/")) if url.path.startswith("/")
              else source.parent / unquote(url.path)).resolve()
    if target.is_dir():
        target /= "index.html"
    assert target.is_relative_to(ROOT), f"Escaping reference: {source.name}: {value}"
    assert target.relative_to(ROOT).as_posix() in published, f"Unpublished reference: {source.name}: {value}"


class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in {"src", "href", "data-photo", "data-waveform"} and value:
                reference(self.source, value)


for name in manifest:
    file = ROOT / name
    assert file.is_file() and not file.is_symlink(), f"Missing/linked file: {name}"
    assert file.stat().st_size < 100_000_000, f"Oversize file: {name}"
    if file.suffix in {".html", ".css", ".js"}:
        text = file.read_text(encoding="utf-8")
        if file.suffix == ".html":
            parser = Links()
            parser.source = file
            parser.feed(text)
        elif file.suffix == ".css":
            for value in re.findall(r"url\(['\"]?([^)'\"]+)", text):
                reference(file, value)
        else:
            for value in re.findall(r"['\"](assets/[^'\"]+)['\"]", text):
                reference(file, value)
wave = json.loads((ROOT / "assets/audio-analysis/emohead-plevat.json").read_text())
assert wave["duration"] > 0 and len(wave["samples"]) > 100
assert all(isinstance(n, (int, float)) and n >= 0 for n in wave["samples"])
print(f"OK: {len(manifest)} published files; local references and waveform verified")
