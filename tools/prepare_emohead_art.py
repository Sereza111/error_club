"""Build two-colour error-diffused portraits without a repeating moire grid."""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'artists' / 'emohead'
INK = (49, 29, 34)
PAPER = (218, 229, 226)

for name in ('portrait', 'alternate'):
    source = Image.open(ROOT / f'{name}.webp').convert('L')
    source.thumbnail((900, 1100), Image.Resampling.LANCZOS)
    source = ImageOps.autocontrast(source, cutoff=1)
    source = ImageEnhance.Brightness(source).enhance(1.17)
    result = Image.new('RGB', source.size)
    src = source.convert('1', dither=Image.Dither.FLOYDSTEINBERG).load()
    dst = result.load()
    for y in range(source.height):
        for x in range(source.width):
            dst[x, y] = PAPER if src[x, y] else INK
    result.save(ROOT / f'{name}-print-v33.png', optimize=True)
    print(name, result.size)
