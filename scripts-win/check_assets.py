#!/usr/bin/env python
"""素材体检：宽度、比例、重复、疑似放大、文件名。0 ERROR 才算过。

用法：
    python scripts-win/check_assets.py public
    python scripts-win/check_assets.py public --require 8 --min-width 1280
    python scripts-win/check_assets.py public --upscale-error   # 疑似放大升级为 ERROR
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image

try:
    import numpy as np
except ImportError:  # numpy 只用于「疑似放大」，缺了也不影响其它检查
    np = None

# Windows 控制台默认按本地编码输出，中文会乱，这里强制 UTF-8
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def upscale_signature(p: Path) -> tuple[float, float, float]:
    """判断这张图是不是"小图放大"来的。

    做法：把图缩到一半再放大回原尺寸，量平均像素差 d2。
    真·原生的高清图有 1~2px 级别的细节，缩一半会丢，d2 明显（实测 0.5~1.0）；
    本来就糊的放大图在那个尺度上没有细节，缩了再放大几乎无损，d2 接近 0（实测 0.12）。
    最近邻放大会留下成对的相同行/列，所以再量一个 dup（相邻行/列完全相同的比例）。

    返回 (d2, dup, std)。
    """
    import numpy as np

    with Image.open(p) as im:
        g = im.convert("L")
        w, h = g.size
        back = g.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS).resize((w, h), Image.LANCZOS)
        a = np.asarray(g, dtype=np.float32)
        b = np.asarray(back, dtype=np.float32)
        d2 = float(np.abs(a - b).mean())
        dv = np.abs(np.diff(a, axis=0)).mean(axis=1)
        dh = np.abs(np.diff(a, axis=1)).mean(axis=0)
        dup = float(((dv < 0.5).mean() + (dh < 0.5).mean()) / 2)
        return d2, dup, float(a.std())


def md5(p: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def upscale_metrics(im: Image.Image) -> tuple[float, float, float] | None:
    """判断一张图是不是"小图放大"来的，两个信号：

    d2  把图缩到一半再放大回来（LANCZOS），和原图比平均误差。
        真·原生图有 1px 级别的细节，缩一半就丢掉了，d2 明显 > 0；
        放大来的图本来就没有那个级别的细节，来回一趟几乎无损，d2 接近 0。
    dup 相邻行列完全相同的比例。像素复制式放大（NEAREST）会让一半的行列成对相同。

    实测（1920×1080 的 Remotion 静帧当基准）：
        原生           d2 0.78~0.93  dup 0.00
        双三次 2×放大   d2 0.12        dup 0.74
        NEAREST 2×放大  d2 0.49        dup 0.87
        JPEG 拼图       d2 0.91        dup 0.47
    所以 d2 < 0.30 或 dup > 0.65 判疑似放大；再要求整体有内容（std > 10），
    否则纯渐变背景会误伤。
    """
    if np is None:
        return None
    g = im.convert("L")
    w, h = g.size
    if w < 400 or h < 200:
        return None
    a = np.asarray(g, dtype=np.float32)
    back = g.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS).resize((w, h), Image.LANCZOS)
    d2 = float(np.abs(a - np.asarray(back, dtype=np.float32)).mean())
    dv = np.abs(np.diff(a, axis=0)).mean(axis=1)
    dh = np.abs(np.diff(a, axis=1)).mean(axis=0)
    dup = float(((dv < 0.5).mean() + (dh < 0.5).mean()) / 2)
    return d2, dup, float(a.std())


def main() -> int:
    ap = argparse.ArgumentParser(description="素材体检")
    ap.add_argument("root", help="素材目录，如 public")
    ap.add_argument("--require", type=int, default=0, help="至少要有几张真实素材（默认 0 不检查）")
    ap.add_argument("--min-width", type=int, default=1280, help="低于此宽度警告（默认 1280）")
    ap.add_argument("--no-upscale", action="store_true", help="跳过「疑似放大」检测")
    ap.add_argument("--upscale-error", action="store_true", help="疑似放大按 ERROR 算，而不是 WARN")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    args = ap.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"[ERROR] 目录不存在：{root}", file=sys.stderr)
        return 2

    files = sorted(p for p in root.rglob("*") if p.suffix.lower() in EXTS)
    errors: list[str] = []
    warns: list[str] = []
    rows: list[dict] = []
    hashes: dict[str, Path] = {}

    for p in files:
        size = p.stat().st_size
        if size == 0:
            errors.append(f"空文件：{p}")
            continue
        try:
            with Image.open(p) as im:
                w, h = im.size
                mode = im.mode
                metrics = None if args.no_upscale else upscale_metrics(im)
        except Exception as e:  # noqa: BLE001
            errors.append(f"读不了：{p} ({e})")
            continue

        rel = p.relative_to(root).as_posix()
        row = {"file": rel, "w": w, "h": h, "mode": mode, "bytes": size}
        if metrics:
            row["d2"] = round(metrics[0], 3)
            row["dup"] = round(metrics[1], 2)
        rows.append(row)

        if w < args.min_width:
            warns.append(f"宽度 {w} < {args.min_width}，4K 下可能糊：{rel}")
        if metrics:
            d2, dup, sd = metrics
            if sd > 10 and (d2 < 0.30 or dup > 0.65):
                why = f"缩半再放大误差 {d2:.2f}" + (f"，重复行列 {dup:.0%}" if dup > 0.65 else "")
                line = f"疑似小图放大：{rel} —— {why}，4K 下会糊，换大图或改用矢量/截图"
                if args.upscale_error:
                    errors.append(line)
                else:
                    warns.append(line)
        if any(ord(ch) > 127 for ch in p.name):
            warns.append(f"文件名含中文/非 ASCII，脚本处理易出错：{rel}")
        digest = md5(p)
        if digest in hashes:
            warns.append(f"内容重复（与 {hashes[digest].relative_to(root).as_posix()} 相同）：{rel}")
        else:
            hashes[digest] = p

        # 常见横版比例
        ar = w / h
        if abs(ar - 16 / 9) > 0.05 and abs(ar - 4 / 3) > 0.05 and abs(ar - 1) > 0.05 and abs(ar - 9 / 16) > 0.05:
            warns.append(f"比例 {ar:.2f} 不是常见画幅，注意场景里不要拉升：{rel}")

    if args.require and len(rows) < args.require:
        errors.append(f"真实素材只有 {len(rows)} 张，少于要求的 {args.require} 张")

    if args.json:
        import json

        print(json.dumps({"files": rows, "errors": errors, "warnings": warns}, ensure_ascii=False, indent=2))
    else:
        print(f"目录：{root}    图片：{len(rows)} 张\n")
        print(f"{'尺寸':<14}{'大小':>10}  {'模式':<6} 文件")
        for r in rows:
            print(f"{r['w']}x{r['h']:<8}{r['bytes'] / 1024:>8.0f}KB  {r['mode']:<6} {r['file']}")
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
