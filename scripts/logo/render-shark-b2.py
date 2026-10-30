# Renders app/assets/mako.ico from the Mako shark in app/renderer/assets/mako-mark.svg, whose white
# "M" is variant B2 (Blue's pick, 2026-10-28): drawn bolder, with sharp corners and the fin tips kept.
# Usage (from the repo root, Python 3 with Pillow): python scripts/logo/render-shark-b2.py
# The committed ICO was made with Python 3.12 and Pillow 13.0.0; another Pillow version may give
# different bytes, so update the hash in app/mako-branding.test.js if you regenerate it.
# The SVG's polygons are drawn as they are; the only difference is a flat navy body instead of the
# SVG's navy gradient (#102549 to #14275f).
import io
import re
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
K = 4  # draw at 4x and scale down, so every edge is anti-aliased
S = 1024 * K
SIZES = [16, 24, 32, 48, 64, 128, 256]


def polys(d):
    # The SVG's group is translated by (43, 230); every path here is straight lines only.
    out = []
    for sub in d.split('M')[1:]:
        n = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', sub)))
        out.append([((n[i] + 43) * K, (n[i + 1] + 230) * K) for i in range(0, len(n), 2)])
    return out


svg = (ROOT / 'app' / 'renderer' / 'assets' / 'mako-mark.svg').read_text(encoding='utf-8')
paths = dict(re.findall(r'<path fill="([^"]+)" d="([^"]+)"', svg))

big = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(big)
d.rounded_rectangle([0, 0, S - 1, S - 1], 176 * K, fill='black')
for fill, colour in [('url(#navy)', (18, 38, 84)), ('#3f65f4', (63, 101, 244)), ('#000', (0, 0, 0)),
                     ('#fff', (255, 255, 255))]:
    for q in polys(paths[fill]):
        d.polygon(q, fill=colour)
master = big.resize((1024, 1024), Image.LANCZOS)

frames = []
for size in SIZES:
    buf = io.BytesIO()
    master.resize((size, size), Image.LANCZOS).save(buf, format='PNG', optimize=True)
    frames.append(buf.getvalue())

# ICO: header, one 16-byte entry per frame, then the PNG frames back to back.
out = struct.pack('<HHH', 0, 1, len(frames))
offset = 6 + 16 * len(frames)
for size, png in zip(SIZES, frames):
    out += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(png), offset)
    offset += len(png)
out += b''.join(frames)
(ROOT / 'app' / 'assets' / 'mako.ico').write_bytes(out)
(ROOT / 'docs' / 'assets').mkdir(exist_ok=True)
master.resize((256, 256), Image.LANCZOS).save(ROOT / 'docs' / 'assets' / 's21-shark-b2.png')
print('wrote app/assets/mako.ico and docs/assets/s21-shark-b2.png')
