"""Build the woomzzzoid track assets from an artist-supplied WAV.

The public page receives a compressed listening copy, a compact spectral envelope,
and a readable spectrogram. The WAV itself is never copied into the repository.
"""
import argparse
import json
import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance


def read_wav(path: Path):
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        rate = source.getframerate()
        width = source.getsampwidth()
        count = source.getnframes()
        if width != 2 or rate < 8000 or channels not in (1, 2):
            raise ValueError("Expected 16-bit mono/stereo PCM WAV")
        raw = source.readframes(count)
    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, rate


def log_bands(rate, n_fft, count=56):
    edges = np.geomspace(35, min(rate / 2 - 1, 18000), count + 1)
    frequencies = np.fft.rfftfreq(n_fft, 1 / rate)
    result = []
    for low, high in zip(edges[:-1], edges[1:]):
        indices = np.flatnonzero((frequencies >= low) & (frequencies < high))
        result.append(indices if len(indices) else np.array([np.abs(frequencies - low).argmin()]))
    return result


def make_spectrum(audio, rate):
    n_fft, hop = 4096, 4096
    pad = np.pad(audio, (0, max(0, n_fft - len(audio) % hop)))
    frame_count = 1 + max(0, (len(pad) - n_fft) // hop)
    frames = np.stack([pad[i * hop:i * hop + n_fft] for i in range(frame_count)])
    window = np.hanning(n_fft).astype(np.float32)
    power = np.abs(np.fft.rfft(frames * window, axis=1)) ** 2
    bands = log_bands(rate, n_fft)
    values = np.stack([np.sqrt(power[:, band].mean(axis=1)) for band in bands], axis=1)
    db = 20 * np.log10(np.maximum(values, 1e-7))
    floor, ceiling = np.percentile(db, [5, 99.5])
    normalized = np.clip((db - floor) / max(1, ceiling - floor), 0, 1)
    # Slightly lift quiet detail while preserving transients.
    normalized = np.sqrt(normalized)
    quantized = np.round(normalized * 255).astype(np.uint8)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    rms = np.clip(rms / max(1e-6, np.percentile(rms, 99)), 0, 1)
    return quantized, rms.astype(np.float32), n_fft, hop


def save_spectrogram(values, path):
    # Low frequencies at the bottom, turquoise through acid green and magenta peaks.
    source = values.T[::-1]
    image = np.empty((*source.shape, 3), dtype=np.uint8)
    intensity = source / 255.0
    image[..., 0] = np.clip(intensity * 185 + (intensity ** 3) * 55, 0, 255)
    image[..., 1] = np.clip(intensity * 245 + (intensity ** 2) * 10, 0, 255)
    image[..., 2] = np.clip(intensity * 235 + (1 - intensity) * 8, 0, 255)
    # Keep the quiet bed nearly black so the logo and type stay legible.
    image = np.clip(image * (0.16 + 0.84 * intensity[..., None]), 0, 255).astype(np.uint8)
    rendered = Image.fromarray(image, "RGB").resize((1600, 620), Image.Resampling.BICUBIC)
    rendered = ImageEnhance.Contrast(rendered).enhance(1.18)
    rendered.save(path, "WEBP", quality=82, method=6)


def save_logo(source_path, output_path):
    image = Image.open(source_path).convert("L")
    ink = ImageChops.invert(image).point(lambda value: 255 if value > 18 else value * 4)
    bbox = ink.getbbox()
    if not bbox:
        raise ValueError("Logo has no dark ink")
    ink = ink.crop(bbox)
    ink.thumbnail((1500, 700), Image.Resampling.LANCZOS)
    rgba = Image.new("RGBA", ink.size, (77, 255, 241, 0))
    rgba.putalpha(ink)
    rgba.save(output_path, "PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wav", type=Path)
    parser.add_argument("logo", type=Path)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    output = args.root / "assets" / "artists" / "woomzzzoid"
    output.mkdir(parents=True, exist_ok=True)
    audio, rate = read_wav(args.wav)
    values, rms, n_fft, hop = make_spectrum(audio, rate)
    duration = len(audio) / rate
    payload = {
        "title": "(не)друг",
        "duration": round(duration * 1000),
        "sampleRate": rate,
        "fftSize": n_fft,
        "hopSize": hop,
        "bands": values.shape[1],
        "frames": values.tolist(),
        "energy": np.round(rms * 255).astype(np.uint8).tolist(),
    }
    (output / "ne-drug-spectrum.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    save_spectrogram(values, output / "ne-drug-spectrogram.webp")
    save_logo(args.logo, output / "woomzzzoid-logo.png")
    print(json.dumps({"duration": round(duration, 3), "frames": len(values), "bands": values.shape[1],
                      "spectrogram": str(output / "ne-drug-spectrogram.webp")}))


if __name__ == "__main__":
    main()
