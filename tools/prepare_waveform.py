"""Export public SoundCloud waveform amplitudes; never download audio or credentials."""
import argparse
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
        return response.read().decode("utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("track")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    page = fetch(args.track)
    match = re.search(r"window\.__sc_hydration\s*=\s*(\[.*?\]);", page)
    if not match:
        raise RuntimeError("Public track metadata was not found")
    entries = json.loads(match.group(1))
    track = next(item["data"] for item in entries if item.get("hydratable") == "sound")
    waveform_url = track["waveform_url"]
    if not waveform_url.startswith("https://wave.sndcdn.com/"):
        raise ValueError("Unexpected waveform host")
    waveform = json.loads(fetch(waveform_url))
    samples = waveform["samples"]
    if not samples or any(not isinstance(x, (int, float)) or x < 0 for x in samples):
        raise ValueError("Invalid waveform samples")
    output = {"track": args.track, "duration": track["duration"], "source": waveform_url,
              "samples": samples}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"title": track["title"], "duration": track["duration"],
                      "samples": len(samples), "waveform": waveform_url}))


if __name__ == "__main__":
    main()
