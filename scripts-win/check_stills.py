#!/usr/bin/env python
"""静帧体检：抽出来的截图之间有没有"真的在动"。0 ERROR 才算过。

为什么要这一步：`check_video.py` 只看容器（时长/尺寸/码率），它能告诉你
"片子是 15 秒"，但告诉不了你"第 6 秒到第 8 秒根本没动"。Remotion 里
最常见的翻车方式就是 `useCurrentFrame()` 拿到了、但值没接到 style 上，
或者 CSS 动画写了却在渲染器里不跑——画面静止，播放器照样出片。

用法：
    python scripts-win/check_stills.py out/stills
    python scripts-win/check_stills.py out/stills --static 0.8 --label f

输出里每一对相邻截图的差值（0~255 的平均绝对差）：
    < 0.05  像素级一模一样 → ERROR，动画没生效 / 渲了同一帧
    < 0.6   基本没动 → WARN，那一段观众看不到变化
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def frame_no(p: Path) -> int:
    """从文件名里取帧号，取不到就排到最后（用路径兜底排序）。"""
    nums = re.findall(r"\d+", p.stem)
    return int(nums[-1]) if nums else 10**9


def load_gray(p: Path, size: tuple[int, int] | None):
    im = Image.open(p).convert("L")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.float32)


def main() -> int:
    ap = argparse.ArgumentParser(description="静帧体检（相邻帧差值）")
    ap.add_argument("root", help="静帧目录")
    ap.add_argument("--static", type=float, default=0.6, help="低于此差值视为静止（默认 0.6）")
    ap.add_argument("--identical", type=float, default=0.05, help="低于此差值视为完全相同（默认 0.05）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    args = ap.parse_args()

    if np is None:
        print("[ERROR] 缺少 numpy，无法比较像素：pip install numpy", file=sys.stderr)
        return 2

    root = Path(args.root)
    if not root.is_dir():
        print(f"[ERROR] 目录不存在：{root}", file=sys.stderr)
        return 2

    files = sorted((p for p in root.iterdir() if p.suffix.lower() in EXTS), key=frame_no)
    if len(files) < 2:
        print(f"[ERROR] 只有 {len(files)} 张图，至少两张才比得出来", file=sys.stderr)
        return 2

    size = Image.open(files[0]).size
    frames = [load_gray(p, size) for p in files]

    rows: list[dict] = []
    errors: list[str] = []
    warns: list[str] = []
    for i in range(1, len(frames)):
        diff = float(np.abs(frames[i] - frames[i - 1]).mean())
        a, b = files[i - 1].name, files[i].name
        rows.append({"from": a, "to": b, "diff": round(diff, 3)})
        if diff < args.identical:
            errors.append(f"两张截图完全一样（差 {diff:.2f}）：{a} → {b} —— 动画没生效，或在播同一帧")
        elif diff < args.static:
            warns.append(f"几乎没动（差 {diff:.2f}）：{a} → {b} —— 这一段观众看不到变化")

    if args.json:
        print(json.dumps({"frames": [p.name for p in files], "pairs": rows, "errors": errors, "warnings": warns}, ensure_ascii=False, indent=2))
        return 1 if errors else 0

    print(f"目录：{root}    静帧：{len(files)} 张    {size[0]}x{size[1]}\n")
    print(f"{'差值':>7}  {'判定':<6} 帧对")
    for r in rows:
        if r["diff"] < args.identical:
            mark = "静止!"
        elif r["diff"] < args.static:
            mark = "偏静"
        else:
            mark = "有动"
        print(f"{r['diff']:>7.2f}  {mark:<6} {r['from']} → {r['to']}")

    if warns:
        print(f"\n[WARN] {len(warns)} 条")
        for w in warns:
            print(f"  - {w}")
    if errors:
        print(f"\n[ERROR] {len(errors)} 条")
        for e in errors:
            print(f"  - {e}")
    print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
