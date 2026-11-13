#!/usr/bin/env python
"""成片体检：不依赖 ffmpeg / ffprobe，直接读 MP4 的 box 结构。

查四件事：
  1. 文件存在且非空
  2. 分辨率与 timing.json 对得上
  3. 时长与 timing.json 对得上（差 > 0.5s 判 ERROR）
  4. 码率没低到离谱（黑屏/空白渲染出来往往只有几百 Kbps）

用法：
    python scripts-win/check_video.py out/demo-1080p.mp4 --timing timing.json
    python scripts-win/check_video.py out/demo-4k.mp4 --timing timing.json
    python scripts-win/check_video.py out/demo-4k.mp4 --width 3840 --height 2160 --duration 52

4K 版不用改参数：给的期望尺寸若是成片的一半（timing.json 里写 1920×1080、
成片是 3840×2160），自动识别为 2× 超采样并通过。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass


def iter_boxes(buf: bytes, start: int, end: int):
    """遍历 [start, end) 内的 box，产出 (type, payload_start, payload_end)。"""
    i = start
    while i + 8 <= end:
        size = int.from_bytes(buf[i : i + 4], "big")
        typ = buf[i + 4 : i + 8].decode("latin-1", "replace")
        header = 8
        if size == 1:  # 64 位长度
            if i + 16 > end:
                return
            size = int.from_bytes(buf[i + 8 : i + 16], "big")
            header = 16
        elif size == 0:  # 到文件尾
            size = end - i
        if size < header or i + size > end:
            return
        yield typ, i + header, i + size
        i += size


def find(buf: bytes, path: list[str], start: int = 0, end: int | None = None):
    """按路径找 box，返回 (payload_start, payload_end)。path 例如 ['moov', 'mvhd']。"""
    if end is None:
        end = len(buf)
    target = path[0]
    for typ, ps, pe in iter_boxes(buf, start, end):
        if typ == target:
            if len(path) == 1:
                return ps, pe
            return find(buf, path[1:], ps, pe)
    return None


def read_duration(buf: bytes) -> float | None:
    """moov/mvhd 里的 duration / timescale，单位秒。"""
    got = find(buf, ["moov", "mvhd"])
    if not got:
        return None
    ps, _ = got
    version = buf[ps]
    if version == 1:
        timescale = int.from_bytes(buf[ps + 20 : ps + 24], "big")
        duration = int.from_bytes(buf[ps + 24 : ps + 32], "big")
    else:
        timescale = int.from_bytes(buf[ps + 12 : ps + 16], "big")
        duration = int.from_bytes(buf[ps + 16 : ps + 20], "big")
    if not timescale:
        return None
    return duration / timescale


def read_size(buf: bytes) -> tuple[int, int] | None:
    """第一个 trak/tkhd 里的宽高（16.16 定点数）。"""
    got = find(buf, ["moov", "trak", "tkhd"])
    if not got:
        return None
    ps, _ = got
    version = buf[ps]
    base = ps + (80 if version == 1 else 76)
    w = int.from_bytes(buf[base : base + 4], "big") / 65536
    h = int.from_bytes(buf[base + 4 : base + 8], "big") / 65536
    return round(w), round(h)


def main() -> int:
    ap = argparse.ArgumentParser(description="校验成片")
    ap.add_argument("file", help="mp4 路径")
    ap.add_argument("--timing", help="可选的 timing.json，用它取期望的分辨率与时长")
    ap.add_argument("--width", type=int)
    ap.add_argument("--height", type=int)
    ap.add_argument("--duration", type=float, help="期望时长（秒）")
    ap.add_argument("--tolerance", type=float, default=0.5, help="时长容差，默认 0.5 秒")
    ap.add_argument("--min-bitrate", type=float, default=0.5, help="最低码率 Mbps，默认 0.5")
    args = ap.parse_args()

    path = Path(args.file)
    errors: list[str] = []
    warns: list[str] = []

    if not path.exists():
        print(f"[ERROR] 文件不存在：{path}")
        return 2
    size = path.stat().st_size
    if size < 1024:
        print(f"[ERROR] 文件只有 {size} 字节，渲染大概率失败了")
        return 2

    exp_w, exp_h, exp_dur = args.width, args.height, args.duration
    if args.timing:
        t = json.loads(Path(args.timing).read_text(encoding="utf-8"))
        exp_w = exp_w or t.get("width")
        exp_h = exp_h or t.get("height")
        exp_dur = exp_dur if exp_dur is not None else t.get("duration")

    buf = path.read_bytes()
    duration = read_duration(buf)
    dims = read_size(buf)

    print(f"文件：{path}")
    print(f"大小：{size / 1024 / 1024:.2f} MB")

    if duration is None:
        warns.append("读不出时长（moov/mvhd 缺失，可能是分片 MP4 或没封装完），用播放器确认")
        print("时长：读不出")
    else:
        br = size * 8 / duration / 1_000_000 if duration else 0
        print(f"时长：{duration:.2f}s   码率：{br:.2f} Mbps")
        if exp_dur is not None and abs(duration - float(exp_dur)) > args.tolerance:
            errors.append(f"时长 {duration:.2f}s 与期望 {float(exp_dur):.2f}s 差超过 {args.tolerance}s")
        if exp_dur is not None and duration and br < args.min_bitrate:
            errors.append(f"码率只有 {br:.2f} Mbps，低于 {args.min_bitrate}：大概率是黑屏或空白帧")

    if dims is None:
        warns.append("读不出分辨率（tkhd 缺失）")
        print("分辨率：读不出")
    else:
        print(f"分辨率：{dims[0]}x{dims[1]}")
        if exp_w and exp_h and dims == (int(exp_w) * 2, int(exp_h) * 2):
            print(f"  （2× 超采样：{int(exp_w)}x{int(exp_h)} 的 4K 版，按通过处理）")
        else:
            if exp_w and dims[0] != int(exp_w):
                errors.append(f"宽度 {dims[0]} != 期望 {exp_w}")
            if exp_h and dims[1] != int(exp_h):
                errors.append(f"高度 {dims[1]} != 期望 {exp_h}")

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
