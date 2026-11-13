#!/usr/bin/env python
"""素材体检：宽度、比例、重复、文件名。0 ERROR 才算过。

用法：
    python scripts-win/check_assets.py public
    python scripts-win/check_assets.py public --require 8 --min-width 1280
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image

# Windows 控制台默认按本地编码输出，中文会乱，这里强制 UTF-8
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def md5(p: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description="素材体检")
    ap.add_argument("root", help="素材目录，如 public")
    ap.add_argument("--require", type=int, default=0, help="至少要有几张真实素材（默认 0 不检查）")
    ap.add_argument("--min-width", type=int, default=1280, help="低于此宽度警告（默认 1280）")
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
        except Exception as e:  # noqa: BLE001
            errors.append(f"读不了：{p} ({e})")
            continue

        rel = p.relative_to(root).as_posix()
        rows.append({"file": rel, "w": w, "h": h, "mode": mode, "bytes": size})

        if w < args.min_width:
            warns.append(f"宽度 {w} < {args.min_width}，4K 下可能糊：{rel}")
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
