# Renders app/assets/mako.ico from the Mako shark (app/renderer/assets/mako-mark.svg), variant B2:
# the white centre "M" drawn bolder, the white fins left as they are. Blue picked B2 on 2026-10-28.
# Usage (from the repo root, Python 3 with Pillow): python scripts/logo/render-shark-b2.py
import io
import re
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
S = 1024
SIZES = [16, 24, 32, 48, 64, 128, 256]
BOLD = 22  # stroke width added around the white shape inside the centre band, in 1024 px units


def polys(d):
    # The SVG's group is translated by (43, 230); every path here is straight lines only.
    out = []
    for sub in d.split('M')[1:]:
        n = list(map(int, re.findall(r'-?\d+', sub)))
        out.append([(n[i] + 43, n[i + 1] + 230) for i in range(0, len(n), 2)])
    return out


svg = (ROOT / 'app' / 'renderer' / 'assets' / 'mako-mark.svg').read_text(encoding='utf-8')
paths = dict(re.findall(r'<path fill="([^"]+)" d="([^"]+)"', svg))  # the B2 stroke path has no d after fill
body = polys(paths['url(#navy)'])
fin = polys(paths['#3f65f4'])
cut = polys(paths['#000'])
white = polys(paths['#fff'])


def white_mask(stroke):
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    for q in white:
        d.polygon(q, fill=255)
        if stroke:
            d.line(q + [q[0]], fill=255, width=stroke, joint='curve')
    return m


band = Image.new('L', (S, S), 0)
ImageDraw.Draw(band).rectangle([43 + 300, 0, 43 + 640, S], fill=255)
band = band.filter(ImageFilter.GaussianBlur(14))
mask = Image.composite(white_mask(BOLD), white_mask(0), band)

master = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(master)
d.rounded_rectangle([0, 0, S - 1, S - 1], 176, fill='black')
for shapes, colour in [(body, (18, 38, 84)), (fin, (63, 101, 244)), (cut, (0, 0, 0))]:
    for q in shapes:
        d.polygon(q, fill=colour)
master.paste((255, 255, 255, 255), (0, 0), mask)

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
