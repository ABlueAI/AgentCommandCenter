"""Exercise the renderer's ICO assembly with a stub for Pillow."""
import runpy
import shutil
import struct
import sys
import tempfile
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


class FakeImage:
    def __init__(self, size):
        self.size = size

    def resize(self, size, resampling):
        return FakeImage(size)

    def save(self, target, format=None, optimize=False):
        frame = b"fixture frame" + struct.pack("<HH", *self.size)
        if hasattr(target, "write"):
            target.write(frame)
        else:
            target.write_bytes(frame)


def test_ico_directory(script, root):
    sandbox_script = root / "scripts" / "logo" / script.name
    sandbox_script.parent.mkdir(parents=True)
    shutil.copyfile(script, sandbox_script)

    svg = root / "app" / "renderer" / "assets" / "mako-mark.svg"
    svg.parent.mkdir(parents=True)
    svg.write_text(
        "".join(f'<path fill="{fill}" d="M0 0 1 1 2 0"/>' for fill in (
            "url(#navy)", "#3f65f4", "#000", "#fff"
        )),
        encoding="utf-8",
    )
    (root / "app" / "assets").mkdir()
    (root / "docs").mkdir()

    pillow = ModuleType("PIL")
    pillow.Image = SimpleNamespace(new=lambda mode, size, color: FakeImage(size), LANCZOS=1)
    pillow.ImageDraw = SimpleNamespace(Draw=lambda image: SimpleNamespace(
        rounded_rectangle=lambda *args, **kwargs: None,
        polygon=lambda *args, **kwargs: None,
    ))
    with patch.dict(sys.modules, {"PIL": pillow}):
        runpy.run_path(str(sandbox_script))

    icon = (root / "app" / "assets" / "mako.ico").read_bytes()
    sizes = [16, 24, 32, 48, 64, 128, 256]
    assert struct.unpack_from("<HHH", icon) == (0, 1, len(sizes))
    expected_offset = 6 + 16 * len(sizes)
    for index, size in enumerate(sizes):
        width, height, _, _, planes, bpp, length, offset = struct.unpack_from(
            "<BBBBHHII", icon, 6 + 16 * index
        )
        assert (width, height, planes, bpp, offset) == (size % 256, size % 256, 1, 32, expected_offset)
        assert icon[offset:offset + length] == b"fixture frame" + struct.pack("<HH", size, size)
        expected_offset += length
    assert len(icon) == expected_offset
    assert (root / "docs" / "assets" / "s21-shark-b2.png").read_bytes() == (
        b"fixture frame" + struct.pack("<HH", 256, 256)
    )


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="mako-logo-test-") as directory:
        test_ico_directory(Path(__file__).with_name("render-shark-b2.py"), Path(directory))
    print("render-shark-b2 ICO directory passed")
