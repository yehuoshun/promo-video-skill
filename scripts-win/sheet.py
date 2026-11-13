#!/usr/bin/env python
"""把目录里的图片拼成一张对比图（审图用）。

用法：
    python scripts-win/sheet.py --dir out/stills --cols 3 --width 960
    python scripts-win/sheet.py --dir out/stills --out out/sheet.jpg --cols 2 --width 1280
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Windows 控制台默认按本地编码输出，中文会乱，这里强制 UTF-8
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def load_font(size: int):
    windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "segoeui.ttf", "arial.ttf"):
        p = windir / "Fonts" / name
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    return ImageFont.load_default()


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} MB" if n >= 1024 * 1024 else f"{n / 1024:.0f} KB"


def main() -> int:
    ap = argparse.ArgumentParser(description="拼图：把一组图片排成对比图")
    ap.add_argument("--dir", required=True, help="图片目录")
    ap.add_argument("--out", default=None, help="输出路径，默认 <dir>/sheet.jpg")
    ap.add_argument("--cols", type=int, default=3, help="列数（默认 3）")
    ap.add_argument("--width", type=int, default=960, help="每张缩略图宽度（默认 960）")
    ap.add_argument("--gap", type=int, default=16, help="间距（默认 16）")
    ap.add_argument("--label", dest="label", action="store_true", default=True)
    ap.add_argument("--no-label", dest="label", action="store_false")
    args = ap.parse_args()

    src = Path(args.dir)
    if not src.is_dir():
        print(f"[ERROR] 目录不存在：{src}", file=sys.stderr)
        return 2

    files = sorted((p for p in src.rglob("*") if p.suffix.lower() in EXTS), key=natural_key)
    if not files:
        print(f"[ERROR] {src} 下没有图片", file=sys.stderr)
        return 2

    cols = max(1, args.cols)
    thumb_w = max(160, args.width)
    gap = max(0, args.gap)
    label_h = 26 if args.label else 0
    font = load_font(15)
    font_small = load_font(13)

    # (原图路径, 缩略图, 原图宽高)
    thumbs: list[tuple[Path, Image.Image, tuple[int, int]]] = []
    for f in files:
        try:
            with Image.open(f) as im:
                im.load()
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGB")
                ow, oh = im.size
                th = max(1, int(round(thumb_w * oh / ow)))
                thumbs.append((f, im.resize((thumb_w, th), Image.LANCZOS), (ow, oh)))
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] 读不了，跳过：{f.name} ({e})")

    if not thumbs:
        print("[ERROR] 没有可用图片", file=sys.stderr)
        return 2

    cell_h = max(t.height for _, t, _ in thumbs) + label_h
    rows = (len(thumbs) + cols - 1) // cols
    W = cols * thumb_w + (cols + 1) * gap
    H = rows * cell_h + (rows + 1) * gap
    sheet = Image.new("RGB", (W, H), (17, 17, 19))
    draw = ImageDraw.Draw(sheet)

    for i, (f, t, (ow, oh)) in enumerate(thumbs):
        r, c = divmod(i, cols)
        x = gap + c * (thumb_w + gap)
        y = gap + r * (cell_h + gap)
        sheet.paste(t, (x, y))
        if args.label:
            draw.rectangle([x, y + t.height, x + thumb_w, y + t.height + label_h], fill=(30, 30, 34))
            draw.text((x + 8, y + t.height + 5), f"{i + 1:02d}  {f.name}", font=font, fill=(225, 225, 230))
            dim = f"{ow}x{oh}"
            draw.text(
                (x + thumb_w - 8 - draw.textlength(dim, font=font_small), y + t.height + 6),
                dim,
                font=font_small,
                fill=(130, 130, 140),
            )

    out = Path(args.out) if args.out else (src / "sheet.jpg")
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() == ".png":
        sheet.save(out)
    else:
        sheet.save(out, quality=88, subsampling=1, optimize=True)

    print(f"共 {len(thumbs)} 张  ->  {out}  ({sheet.width}x{sheet.height}, {human(out.stat().st_size)})")
    print("逐张尺寸：")
    for i, (_, _, (ow, oh)) in enumerate(thumbs, 1):
        print(f"  {i:02d}  {ow}x{oh}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
