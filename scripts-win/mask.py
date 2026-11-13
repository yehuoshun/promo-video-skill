#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mask.py —— 给真实截图打码（马赛克 / 纯色块 / 模糊）。

为什么单独一个脚本而不是手工开 PS 涂：宣传片里每张真实截图都要过一遍，
手工涂一定有漏；漏一次就是把别人的账号、邮箱、私有库名播出去。
所以把「哪些区域要盖」写成命令行参数，跟着素材一起留在项目里，
以后换一张同版式的截图，重跑一遍就是同一个遮罩。

用法（坐标默认按**占比**给，0~1，与 4K 截图的分辨率无关）：
    python scripts-win/mask.py in.png -o out.png --mosaic 0.78,0,0.22,0.075
    python scripts-win/mask.py in.png -o out.png --solid 0.02,0.02,0.2,0.05 --px 1200,600,2400,700
    python scripts-win/mask.py in.png -o out.png --auto yuque       # 语雀顶栏：头像 + 用户名

参数 x,y,w,h：左上角与宽高。--px 之后的区域按像素算。
默认马赛克而不是模糊：模糊看起来像图糊了，像 bug；马赛克是有意的遮盖，观众一眼知道「这里打了码」。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")

# 语雀顶栏的敏感区：左侧头像/用户名、右侧的账号菜单
PRESETS: dict[str, list[tuple[float, float, float, float]]] = {
    "yuque": [
        (0.00, 0.00, 0.16, 0.070),  # 左上：站点/用户入口
        (0.76, 0.00, 0.24, 0.070),  # 右上：头像、昵称、消息铃铛
    ],
    "yuque-toc": [
        (0.00, 0.00, 0.16, 0.070),
        (0.76, 0.00, 0.24, 0.070),
        (0.00, 0.070, 0.19, 0.10),  # 左栏「我的知识库」区域里的库名
    ],
}


def parse_region(text: str, pixels: bool, w: int, h: int) -> tuple[int, int, int, int]:
    parts = [float(p) for p in text.replace("，", ",").split(",")]
    if len(parts) != 4:
        raise SystemExit(f"区域要四个数 x,y,w,h：{text}")
    x, y, rw, rh = parts
    if pixels:
        box = (int(x), int(y), int(x + rw), int(y + rh))
    else:
        box = (int(round(x * w)), int(round(y * h)), int(round((x + rw) * w)), int(round((y + rh) * h)))
    # 夹到图内，避免越界
    return (max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3]))


def mosaic(im: Image.Image, box: tuple[int, int, int, int], block: int) -> None:
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    crop = im.crop(box)
    small = crop.resize((max(1, crop.width // block), max(1, crop.height // block)), Image.BILINEAR)
    im.paste(small.resize(crop.size, Image.NEAREST), box)


def solid(im: Image.Image, box: tuple[int, int, int, int], color: str) -> None:
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    im.paste(Image.new("RGB", (x1 - x0, y1 - y0), color), box)


def blur(im: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(radius)), box)


def main() -> int:
    ap = argparse.ArgumentParser(description="给截图打码（马赛克/纯色/模糊）")
    ap.add_argument("src")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--auto", default=None, choices=sorted(PRESETS), help="内置预设区域")
    ap.add_argument("--region", action="append", default=[], metavar="x,y,w,h", help="占比区域，可多次给")
    ap.add_argument("--px", action="append", default=[], metavar="x,y,w,h", help="像素区域，可多次给")
    ap.add_argument("--solid", action="append", default=[], metavar="x,y,w,h", help="改成纯色块（与 --region 同坐标）")
    ap.add_argument("--color", default="#1b1f27", help="纯色块颜色")
    ap.add_argument("--block", type=int, default=28, help="马赛克格子边长（设备像素），默认 28")
    ap.add_argument("--blur", action="store_true", help="用模糊代替马赛克")
    ap.add_argument("--radius", type=int, default=18)
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGB")
    w, h = im.size

    regions: list[tuple[int, int, int, int]] = []
    for r in PRESETS.get(args.auto, []) if args.auto else []:
        regions.append(parse_region(f"{r[0]},{r[1]},{r[2]},{r[3]}", False, w, h))
    for r in args.region:
        regions.append(parse_region(r, False, w, h))
    for r in args.px:
        regions.append(parse_region(r, True, w, h))

    if not regions:
        raise SystemExit("没有给任何区域：用 --auto / --region / --px 指定要盖哪里")

    solid_boxes = [parse_region(r, False, w, h) for r in args.solid]
    regions.extend(solid_boxes)

    for box in regions:
        if box in solid_boxes:
            solid(im, box, args.color)
        elif args.blur:
            blur(im, box, args.radius)
        else:
            mosaic(im, box, args.block)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    print(f"已打码 {len(regions)} 处 → {out}  ({im.width}x{im.height})")
    for box in regions:
        print(f"  {box}  占比 (%.3f, %.3f, %.3f, %.3f)" % (box[0] / w, box[1] / h, (box[2] - box[0]) / w, (box[3] - box[1]) / h))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
